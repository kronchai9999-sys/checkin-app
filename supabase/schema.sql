-- ============================================================
-- ระบบ HR เช็คอิน+เงินเดือน — สคีมา Supabase (Postgres)
-- รันครั้งเดียว: Supabase → SQL Editor → New query → วางทั้งไฟล์ → Run
-- ปลอดภัยรันซ้ำได้ (idempotent)
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- โครงองค์กร ----------
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
  radius     integer not null default 150
);

create table if not exists shifts (
  id            text primary key,
  company_id    text not null references companies(id) on delete cascade,
  name          text not null,
  start_time    text not null,            -- "08:00"
  end_time      text not null,            -- "17:00"
  lunch_minutes integer not null default 60   -- พักเที่ยงมาตรฐาน (นาที)
);

-- ---------- พนักงาน + สิทธิ์ ----------
-- role:       employee=พนักงาน, head=หัวหน้า, exec=ผู้บริหาร
-- department: front=หน้าร้าน, back=หลังร้าน (ล็อกกะ + เที่ยงยืดหยุ่น ไม่จับ GPS)
create table if not exists employees (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,          -- EMP-001
  username    text unique not null,          -- ใช้ล็อกอิน
  password    text not null,                 -- ภายในองค์กร (ปิดอ่านผ่าน RLS; ล็อกอินผ่าน RPC)
  name        text not null,
  role        text not null default 'employee' check (role in ('employee','head','exec')),
  department  text not null default 'front'  check (department in ('front','back')),
  company_id  text references companies(id),
  branch_id   text references branches(id),
  shift_id    text references shifts(id),
  position    text,
  pay_type    text not null default 'monthly' check (pay_type in ('monthly','daily')),
  base_salary numeric not null default 0,
  start_date  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- การตอกบัตร ----------
-- punch_type: in=เข้างาน, lunch_out=พักเที่ยงออก, lunch_in=พักเที่ยงเข้า, out=เลิกงาน
create table if not exists attendance_logs (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  punch_type  text not null check (punch_type in ('in','lunch_out','lunch_in','out')),
  ts          timestamptz not null default now(),
  lat         double precision,
  lng         double precision,
  distance    integer,
  branch_id   text references branches(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_att_emp_ts on attendance_logs(employee_id, ts);

-- ---------- บันทึกหักเงิน (แก้บั๊ก deduct_logs) ----------
create table if not exists deduct_logs (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees(id) on delete cascade,
  period          text not null,             -- "กรกฎาคม 2026"
  type            text not null,             -- ทำของเสียหาย / เงินขาด / อื่นๆ
  amount          numeric not null default 0,
  note            text,
  created_by      uuid references employees(id),
  created_by_name text,                       -- โชว์ชื่อผู้บันทึก/อนุมัติ
  created_at      timestamptz not null default now()
);
create index if not exists idx_deduct_emp on deduct_logs(employee_id, period);

-- ---------- OT / วันหยุด / ค่าน้ำมัน ----------
create table if not exists ot_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  period text not null,
  ot_date text,
  minutes integer not null default 0,        -- นาที OT ดิบ (ปัดตอนคำนวณ)
  note text,
  approved_by uuid references employees(id),
  approved_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists holidays (
  id uuid primary key default gen_random_uuid(),
  company_id text references companies(id),
  holiday_date text not null,
  name text not null,
  paid boolean not null default true
);

create table if not exists fuel_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  period text not null,
  fuel_date text,
  amount numeric not null default 0,
  note text,
  created_by_name text,
  created_at timestamptz not null default now()
);

-- ---------- คำขออนุมัติ (โชว์ชื่อผู้อนุมัติ) ----------
-- request_type: shift_change=เปลี่ยนกะ, leave=ลา, time_edit=แก้เวลา, ot_edit=แก้ OT ฯลฯ
-- กติกา: หัวหน้า(head) อนุมัติได้ทุกอย่าง ยกเว้น time_edit / ot_edit (ต้องผู้บริหาร)
create table if not exists approvals (
  id             uuid primary key default gen_random_uuid(),
  request_type   text not null,
  employee_id    uuid not null references employees(id) on delete cascade,
  detail         text,
  payload        jsonb,
  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  approver_id    uuid references employees(id),
  approver_name  text,                        -- โชว์ว่าใครอนุมัติ
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_appr_status on approvals(status, created_at);

-- ============================================================
-- RLS
-- ============================================================
alter table companies       enable row level security;
alter table branches        enable row level security;
alter table shifts          enable row level security;
alter table employees       enable row level security;
alter table attendance_logs enable row level security;
alter table deduct_logs     enable row level security;
alter table ot_logs         enable row level security;
alter table holidays        enable row level security;
alter table fuel_logs       enable row level security;
alter table approvals       enable row level security;

-- อ่านได้ (ข้อมูลโครงสร้าง/รายการที่ไม่ลับ)
do $$
declare t text;
begin
  foreach t in array array['companies','branches','shifts','attendance_logs','deduct_logs','ot_logs','holidays','fuel_logs','approvals']
  loop
    execute format('drop policy if exists p_read on %I', t);
    execute format('create policy p_read on %I for select using (true)', t);
    execute format('drop policy if exists p_write on %I', t);
    execute format('create policy p_write on %I for all using (true) with check (true)', t);
  end loop;
end $$;

-- employees: ไม่มี policy select ให้ anon (กัน username/password รั่ว) — เข้าถึงผ่าน RPC เท่านั้น

-- ============================================================
-- RPC: ล็อกอินด้วย user + password (โชว์ req 7)
-- ============================================================
create or replace function login_by_credentials(p_username text, p_password text)
returns table (
  id uuid, code text, name text, role text, department text,
  company_id text, branch_id text, shift_id text,
  position text, pay_type text, base_salary numeric, start_date text
)
language sql security definer set search_path = public as $$
  select e.id, e.code, e.name, e.role, e.department,
         e.company_id, e.branch_id, e.shift_id,
         e.position, e.pay_type, e.base_salary, e.start_date
  from employees e
  where e.username = p_username and e.password = p_password and e.active
  limit 1;
$$;
grant execute on function login_by_credentials(text, text) to anon, authenticated;

-- RPC: รายชื่อพนักงาน (สำหรับหน้าแอดมิน — ไม่ส่ง password)
create or replace function list_employees()
returns table (
  id uuid, code text, name text, role text, department text,
  company_id text, branch_id text, shift_id text,
  position text, pay_type text, base_salary numeric, start_date text, active boolean
)
language sql security definer set search_path = public as $$
  select e.id, e.code, e.name, e.role, e.department,
         e.company_id, e.branch_id, e.shift_id,
         e.position, e.pay_type, e.base_salary, e.start_date, e.active
  from employees e order by e.code;
$$;
grant execute on function list_employees() to anon, authenticated;

-- ============================================================
-- Seed — แก้ user/password/เงินเดือนจริงก่อนใช้งาน
-- ============================================================
insert into companies (id, name) values
  ('bakery', 'ร้านเบเกอรี่บรรจุภัณฑ์ กาฬสินธุ์')
on conflict (id) do update set name = excluded.name;

insert into branches (id, company_id, name, lat, lng, radius) values
  ('b1', 'bakery', 'สาขากาฬสินธุ์', 16.4322, 103.5060, 150)
on conflict (id) do update set
  company_id=excluded.company_id, name=excluded.name,
  lat=excluded.lat, lng=excluded.lng, radius=excluded.radius;

insert into shifts (id, company_id, name, start_time, end_time, lunch_minutes) values
  ('morning', 'bakery', 'กะเช้า', '08:00', '17:00', 60),
  ('afternoon','bakery','กะบ่าย', '13:00', '22:00', 60)
on conflict (id) do update set
  company_id=excluded.company_id, name=excluded.name,
  start_time=excluded.start_time, end_time=excluded.end_time, lunch_minutes=excluded.lunch_minutes;

-- ผู้บริหาร / หัวหน้า / พนักงานหน้าร้าน / พนักงานหลังร้าน
insert into employees (code, username, password, name, role, department, company_id, branch_id, shift_id, position, pay_type, base_salary, start_date) values
  ('EMP-000','admin', 'admin1234','ผู้บริหาร',        'exec',     'front','bakery','b1','morning','ผู้บริหาร',   'monthly',30000,'01/01/2565'),
  ('EMP-001','head1', 'head1234', 'หัวหน้าสาขา',       'head',     'front','bakery','b1','morning','หัวหน้าสาขา','monthly',18000,'01/03/2566'),
  ('EMP-002','somying','1234',    'สมหญิง ใจดี',       'employee', 'front','bakery','b1','morning','พนักงานขาย', 'monthly',13000,'01/03/2566'),
  ('EMP-003','prayut', '1234',    'ประยุทธ์ ขยันงาน',  'employee', 'back', 'bakery','b1','morning','พนักงานครัว','monthly',12000,'15/08/2567')
on conflict (code) do nothing;
