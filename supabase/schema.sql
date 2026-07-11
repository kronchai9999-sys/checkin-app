-- ============================================================
-- แอปเช็คอินพนักงาน — สคีมา Supabase (Postgres)
-- รันไฟล์นี้ครั้งเดียวใน Supabase → SQL Editor → New query → วาง → Run
-- ปลอดภัยรันซ้ำได้ (idempotent)
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- ตารางหลัก ----------
create table if not exists companies (
  id   text primary key,
  name text not null
);

create table if not exists branches (
  id         text primary key,
  company_id text not null references companies(id) on delete cascade,
  name       text not null,
  lat        double precision not null,
  lng        double precision not null,
  radius     integer not null default 150   -- รัศมีอนุญาต (เมตร)
);

create table if not exists shifts (
  id         text primary key,
  company_id text not null references companies(id) on delete cascade,
  name       text not null,
  start_time text not null,   -- "08:00"
  end_time   text not null    -- "17:00"
);

create table if not exists employees (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,          -- EMP-001
  name        text not null,
  pin         text not null,                 -- PIN 6 หลัก (ภายในองค์กร; ปิดอ่านผ่าน RLS)
  company_id  text references companies(id),
  branch_id   text references branches(id),
  shift_id    text references shifts(id),
  position    text,
  pay_type    text not null default 'monthly',  -- monthly | daily
  base_salary numeric not null default 0,
  start_date  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists attendance_logs (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  punch_type  text not null check (punch_type in ('in','out')),
  ts          timestamptz not null default now(),
  lat         double precision,
  lng         double precision,
  distance    integer,                       -- ระยะห่างจากสาขา (เมตร) ตอนตอก
  branch_id   text references branches(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_att_emp_ts on attendance_logs(employee_id, ts);

-- ============================================================
-- RLS: เปิดใช้กับทุกตาราง
--  - companies/branches/shifts : anon อ่านได้ (ใช้แสดงผลหน้าเช็คอิน)
--  - employees                 : anon อ่านตรง ๆ ไม่ได้ (กัน PIN รั่ว) — ล็อกอินผ่าน RPC เท่านั้น
--  - attendance_logs           : anon เพิ่ม/อ่านได้ (แอปภายใน) — ปรับเข้มได้ภายหลังเมื่อทำ auth เต็ม
-- ============================================================
alter table companies       enable row level security;
alter table branches        enable row level security;
alter table shifts          enable row level security;
alter table employees       enable row level security;
alter table attendance_logs enable row level security;

drop policy if exists p_companies_read on companies;
create policy p_companies_read on companies for select using (true);

drop policy if exists p_branches_read on branches;
create policy p_branches_read on branches for select using (true);

drop policy if exists p_shifts_read on shifts;
create policy p_shifts_read on shifts for select using (true);

-- employees: ไม่มี policy select ให้ anon → อ่านตรงไม่ได้ (PIN ปลอดภัย)
drop policy if exists p_att_insert on attendance_logs;
create policy p_att_insert on attendance_logs for insert with check (true);

drop policy if exists p_att_read on attendance_logs;
create policy p_att_read on attendance_logs for select using (true);

-- ============================================================
-- RPC: ล็อกอินด้วย PIN (SECURITY DEFINER — เลี่ยง RLS ได้ในฟังก์ชัน)
-- คืนข้อมูลพนักงาน "โดยไม่ส่ง pin ออกไป"
-- ============================================================
create or replace function login_by_pin(p_pin text)
returns table (
  id uuid, code text, name text, position text,
  company_id text, branch_id text, shift_id text,
  pay_type text, base_salary numeric, start_date text
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.code, e.name, e.position,
         e.company_id, e.branch_id, e.shift_id,
         e.pay_type, e.base_salary, e.start_date
  from employees e
  where e.pin = p_pin and e.active
  limit 1;
$$;

grant execute on function login_by_pin(text) to anon, authenticated;

-- ============================================================
-- ข้อมูลเริ่มต้น (seed) — แก้ PIN/เงินเดือนให้ตรงจริงก่อนใช้งาน
-- ============================================================
insert into companies (id, name) values
  ('bakery', 'ร้านเบเกอรี่บรรจุภัณฑ์'),
  ('jimart', 'jimart ค้าส่ง')
on conflict (id) do update set name = excluded.name;

insert into branches (id, company_id, name, lat, lng, radius) values
  ('b1',  'bakery', 'สาขาหนองคาย',        17.8782, 102.742, 150),
  ('b2',  'bakery', 'สาขาอุดรธานี',        17.4138, 102.787, 150),
  ('j01', 'jimart', 'คลังกลาง อุดรธานี',   17.4,    102.8,   200)
on conflict (id) do update set
  company_id = excluded.company_id, name = excluded.name,
  lat = excluded.lat, lng = excluded.lng, radius = excluded.radius;

insert into shifts (id, company_id, name, start_time, end_time) values
  ('morning',   'bakery', 'กะเช้า', '07:00', '16:00'),
  ('afternoon', 'bakery', 'กะบ่าย', '13:00', '22:00'),
  ('night',     'bakery', 'กะดึก',  '22:00', '06:00'),
  ('day',       'jimart', 'กะปกติ', '08:00', '17:00')
on conflict (id) do update set
  company_id = excluded.company_id, name = excluded.name,
  start_time = excluded.start_time, end_time = excluded.end_time;

-- พนักงานตัวอย่าง (PIN 123456 / 141414) — เปลี่ยนก่อนใช้จริง
insert into employees (code, name, pin, company_id, branch_id, shift_id, position, pay_type, base_salary, start_date) values
  ('EMP-001', 'สมหญิง ใจดี',       '123456', 'bakery', 'b1', 'morning', 'พนักงานขาย', 'monthly', 13000, '01/03/2566'),
  ('EMP-014', 'ประยุทธ์ ขยันงาน',  '141414', 'bakery', 'b2', 'morning', 'แคชเชียร์',   'monthly', 11000, '15/08/2567')
on conflict (code) do nothing;
