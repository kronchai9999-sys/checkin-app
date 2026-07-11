import { useState, useEffect } from "react";
import { listEmployees, fetchOrg, createEmployee, updateEmployee } from "../lib/db.js";
import { isSupabaseReady } from "../lib/supabase.js";
import { DEMO_EMPLOYEES, DEMO_ORG } from "../lib/demo.js";
import { canManageStaff, ROLE_LABEL } from "../lib/rules.js";
import { Page, PageHeader, Card, Select, Field, inputCls, Badge, Empty, DemoTag } from "../ui.jsx";

const ROLES = [
  { v: "employee", l: "พนักงาน" },
  { v: "head", l: "หัวหน้า / ผู้จัดการ" },
  { v: "exec", l: "ผู้บริหาร" },
];
const DEPTS = [
  { v: "front", l: "หน้าร้าน" },
  { v: "back", l: "หลังร้าน (ล็อกกะ)" },
];

const blank = (branch, shift) => ({
  code: "", name: "", username: "", password: "",
  role: "employee", department: "front",
  branch_id: branch || "", shift_id: shift || "",
  position: "", pay_type: "monthly", base_salary: "", start_date: "",
});

export default function Employees({ employee }) {
  const allowed = canManageStaff(employee?.role);
  const [emps, setEmps] = useState(DEMO_EMPLOYEES);
  const [org, setOrg] = useState(DEMO_ORG);
  const [form, setForm] = useState(blank());
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listEmployees().then((l) => l && l.length && setEmps(l));
    fetchOrg().then((o) => { if (o) { setOrg(o); setForm((f) => ({ ...f, branch_id: o.branches[0]?.id, shift_id: o.shifts[0]?.id })); } });
  }, []);
  // ตั้ง default สาขา/กะ จากเดโมถ้ายังว่าง
  useEffect(() => {
    setForm((f) => ({ ...f, branch_id: f.branch_id || org.branches[0]?.id, shift_id: f.shift_id || org.shifts[0]?.id }));
  }, []); // eslint-disable-line

  async function refresh() {
    const l = await listEmployees();
    if (l) setEmps(l);
  }
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    if (!form.code || !form.username || !form.password || !form.name) {
      setMsg({ ok: false, text: "กรอก รหัส / ชื่อ / username / รหัสผ่าน ให้ครบ" }); return;
    }
    setBusy(true); setMsg(null);
    const branch = org.branches.find((b) => b.id === form.branch_id);
    const payload = {
      code: form.code.trim(), name: form.name.trim(),
      username: form.username.trim(), password: form.password,
      role: form.role, department: form.department,
      company_id: branch?.company_id || "bakery",
      branch_id: form.branch_id, shift_id: form.shift_id,
      position: form.position.trim() || null,
      pay_type: form.pay_type, base_salary: Number(form.base_salary) || 0,
      start_date: form.start_date.trim() || null,
    };
    const res = await createEmployee(payload);
    setBusy(false);
    if (res?.error) { setMsg({ ok: false, text: "เพิ่มไม่สำเร็จ: " + res.error }); return; }
    if (res?.demo) {
      setEmps((l) => [...l, { id: "new-" + Math.random().toString(36).slice(2), active: true, ...payload }]);
    } else { await refresh(); }
    setMsg({ ok: true, text: `เพิ่ม "${payload.name}" (${ROLE_LABEL[payload.role]}) แล้ว` });
    setForm(blank(org.branches[0]?.id, org.shifts[0]?.id));
  }

  async function changeRole(emp, role) {
    setEmps((l) => l.map((e) => (e.id === emp.id ? { ...e, role } : e)));
    await updateEmployee(emp.id, { role });
  }
  async function toggleActive(emp) {
    const active = !(emp.active !== false);
    setEmps((l) => l.map((e) => (e.id === emp.id ? { ...e, active } : e)));
    await updateEmployee(emp.id, { active });
  }

  if (!allowed) return <Page><PageHeader icon="🔒" title="จัดการพนักงาน" accent="amber" /><Card><Empty>เฉพาะผู้บริหารเท่านั้น</Empty></Card></Page>;

  return (
    <Page>
      <PageHeader icon="👥" title="จัดการพนักงาน" accent="amber" subtitle="เพิ่มพนักงาน/ผู้จัดการได้ไม่จำกัด · กำหนดบทบาท/สิทธิ" />
      {!isSupabaseReady && <DemoTag />}

      {/* ฟอร์มเพิ่ม */}
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">เพิ่มพนักงานใหม่</h2>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="รหัสพนักงาน"><input className={inputCls} value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="EMP-004" /></Field>
          <Field label="ชื่อ-สกุล"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ชื่อ นามสกุล" /></Field>
          <Field label="บทบาท (สิทธิ)"><Select value={form.role} onChange={(e) => set("role", e.target.value)}>{ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</Select></Field>
          <Field label="Username"><input className={inputCls} value={form.username} onChange={(e) => set("username", e.target.value)} autoCapitalize="none" placeholder="ใช้ล็อกอิน" /></Field>
          <Field label="รหัสผ่าน"><input className={inputCls} value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="รหัสผ่าน" /></Field>
          <Field label="แผนก"><Select value={form.department} onChange={(e) => set("department", e.target.value)}>{DEPTS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}</Select></Field>
          <Field label="สาขา"><Select value={form.branch_id} onChange={(e) => set("branch_id", e.target.value)}>{org.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
          <Field label="กะ"><Select value={form.shift_id} onChange={(e) => set("shift_id", e.target.value)}>{org.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="ตำแหน่ง"><input className={inputCls} value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="เช่น พนักงานขาย" /></Field>
          <Field label="ประเภทค่าจ้าง"><Select value={form.pay_type} onChange={(e) => set("pay_type", e.target.value)}><option value="monthly">รายเดือน</option><option value="daily">รายวัน</option></Select></Field>
          <Field label="เงินเดือน/ค่าจ้าง"><input type="number" min="0" className={inputCls} value={form.base_salary} onChange={(e) => set("base_salary", e.target.value)} placeholder="0" /></Field>
          <Field label="วันเริ่มงาน"><input className={inputCls} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} placeholder="01/01/2568" /></Field>
          <div className="col-span-2 sm:col-span-3">
            {msg && <p className={`mb-2 text-sm ${msg.ok ? "text-emerald-600" : "text-rose-500"}`}>{msg.text}</p>}
            <button type="submit" disabled={busy} className={`w-full rounded-xl py-3 text-sm font-semibold text-white ${busy ? "bg-slate-300" : "bg-emerald-600 active:bg-emerald-700"}`}>
              {busy ? "กำลังเพิ่ม…" : "➕ เพิ่มพนักงาน"}
            </button>
          </div>
        </form>
      </Card>

      {/* รายชื่อ + กำหนดสิทธิ */}
      <Card className="!p-0">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">พนักงานทั้งหมด ({emps.length})</div>
        {emps.map((e) => {
          const inactive = e.active === false;
          return (
            <div key={e.id} className={`flex items-center justify-between gap-3 border-b border-slate-50 px-4 py-3 last:border-0 ${inactive ? "opacity-50" : ""}`}>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{e.name} {inactive && <span className="text-xs text-rose-500">(ปิดใช้งาน)</span>}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                  <span>{e.code}</span>
                  <Badge tone={e.department === "back" ? "rose" : "slate"}>{e.department === "back" ? "หลังร้าน" : "หน้าร้าน"}</Badge>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select value={e.role} onChange={(ev) => changeRole(e, ev.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-emerald-500">
                  {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
                <button onClick={() => toggleActive(e)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ${inactive ? "text-emerald-600 ring-emerald-200" : "text-rose-500 ring-rose-200"}`}>
                  {inactive ? "เปิด" : "ปิด"}
                </button>
              </div>
            </div>
          );
        })}
      </Card>
      <p className="mt-3 px-1 text-xs text-slate-400">* บทบาท: พนักงาน = ดูของตัวเอง · หัวหน้า/ผู้จัดการ = อนุมัติ+หักเงิน+กำหนดกะ · ผู้บริหาร = ทุกอย่าง+จัดการพนักงาน</p>
    </Page>
  );
}
