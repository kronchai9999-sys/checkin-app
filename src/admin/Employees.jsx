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
  position: "", pay_type: "monthly", base_salary: "", start_date: "", sso: true,
});

export default function Employees({ employee }) {
  const allowed = canManageStaff(employee?.role);
  const [emps, setEmps] = useState(DEMO_EMPLOYEES);
  const [org, setOrg] = useState(DEMO_ORG);
  const [form, setForm] = useState(blank());
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // แก้ไขพนักงานเดิม
  const [editing, setEditing] = useState(null);   // employee object หรือ null
  const [ef, setEf] = useState(null);             // ค่าในฟอร์มแก้ไข
  const [eBusy, setEBusy] = useState(false);
  const [eMsg, setEMsg] = useState(null);

  useEffect(() => {
    listEmployees().then((l) => l && l.length && setEmps(l));
    fetchOrg().then((o) => { if (o) { setOrg(o); setForm((f) => ({ ...f, branch_id: o.branches[0]?.id, shift_id: o.shifts[0]?.id })); } });
  }, []);
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
      start_date: form.start_date.trim() || null, sso: form.sso,
    };
    const res = await createEmployee(payload);
    setBusy(false);
    if (res?.error) { setMsg({ ok: false, text: "เพิ่มไม่สำเร็จ: " + res.error }); return; }
    if (res?.demo) setEmps((l) => [...l, { id: "new-" + Math.random().toString(36).slice(2), active: true, ...payload }]);
    else await refresh();
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

  // ---- แก้ไข ----
  function openEdit(emp) {
    setEMsg(null);
    setEf({
      name: emp.name || "", role: emp.role || "employee", department: emp.department || "front",
      branch_id: emp.branch_id || org.branches[0]?.id, shift_id: emp.shift_id || org.shifts[0]?.id,
      position: emp.position || "", pay_type: emp.pay_type || "monthly",
      base_salary: emp.base_salary ?? "", start_date: emp.start_date || "",
      sso: emp.sso !== false,
      username: "", password: "",  // เว้นว่าง = ไม่เปลี่ยน
    });
    setEditing(emp);
  }
  const setE = (k, v) => setEf((f) => ({ ...f, [k]: v }));

  async function saveEdit(e) {
    e?.preventDefault();
    if (eBusy || !editing) return;
    if (!ef.name.trim()) { setEMsg({ ok: false, text: "กรอกชื่อ" }); return; }
    setEBusy(true); setEMsg(null);
    const branch = org.branches.find((b) => b.id === ef.branch_id);
    const patch = {
      name: ef.name.trim(), role: ef.role, department: ef.department,
      company_id: branch?.company_id || "bakery",
      branch_id: ef.branch_id, shift_id: ef.shift_id,
      position: ef.position.trim() || null, pay_type: ef.pay_type,
      base_salary: Number(ef.base_salary) || 0, start_date: ef.start_date.trim() || null,
      sso: ef.sso,
    };
    if (ef.username.trim()) patch.username = ef.username.trim();
    if (ef.password) patch.password = ef.password;
    const res = await updateEmployee(editing.id, patch);
    setEBusy(false);
    if (res?.error) { setEMsg({ ok: false, text: "บันทึกไม่สำเร็จ: " + res.error }); return; }
    if (res?.demo) setEmps((l) => l.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)));
    else await refresh();
    setEditing(null); setEf(null);
  }

  if (!allowed) return <Page><PageHeader icon="🔒" title="จัดการพนักงาน" accent="amber" /><Card><Empty>เฉพาะผู้บริหารเท่านั้น</Empty></Card></Page>;

  return (
    <Page>
      <PageHeader icon="👥" title="จัดการพนักงาน" accent="amber" subtitle="เพิ่ม/แก้ไขพนักงาน · กำหนดบทบาท/สิทธิ · เปลี่ยนรหัสผ่าน" />
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
          <Field label="ประกันสังคม">
            <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
              <input type="checkbox" checked={form.sso} onChange={(e) => set("sso", e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              <span>{form.sso ? "หัก สปส. 5%" : "ไม่หัก สปส."}</span>
            </label>
          </Field>
          <div className="col-span-2 sm:col-span-3">
            {msg && <p className={`mb-2 text-sm ${msg.ok ? "text-emerald-600" : "text-rose-500"}`}>{msg.text}</p>}
            <button type="submit" disabled={busy} className={`w-full rounded-xl py-3 text-sm font-semibold text-white ${busy ? "bg-slate-300" : "bg-emerald-600 active:bg-emerald-700"}`}>
              {busy ? "กำลังเพิ่ม…" : "➕ เพิ่มพนักงาน"}
            </button>
          </div>
        </form>
      </Card>

      {/* รายชื่อ */}
      <Card className="!p-0">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">พนักงานทั้งหมด ({emps.length})</div>
        {emps.map((e) => {
          const inactive = e.active === false;
          return (
            <div key={e.id} className={`flex items-center justify-between gap-2 border-b border-slate-50 px-4 py-3 last:border-0 ${inactive ? "opacity-50" : ""}`}>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{e.name} {inactive && <span className="text-xs text-rose-500">(ปิด)</span>}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                  <span>{e.code}</span>
                  <Badge tone={e.department === "back" ? "rose" : "slate"}>{e.department === "back" ? "หลังร้าน" : "หน้าร้าน"}</Badge>
                  <span>{ROLE_LABEL[e.role]}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => openEdit(e)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-sky-600 ring-1 ring-sky-200 hover:bg-sky-50">แก้ไข</button>
                <button onClick={() => toggleActive(e)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ${inactive ? "text-emerald-600 ring-emerald-200" : "text-rose-500 ring-rose-200"}`}>{inactive ? "เปิด" : "ปิด"}</button>
              </div>
            </div>
          );
        })}
      </Card>
      <p className="mt-3 px-1 text-xs text-slate-400">* บทบาท: พนักงาน = ดูของตัวเอง · หัวหน้า/ผู้จัดการ = อนุมัติ+หักเงิน+กำหนดกะ · ผู้บริหาร = ทุกอย่าง+จัดการพนักงาน</p>

      {/* ===== Modal แก้ไข ===== */}
      {editing && ef && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="mt-6 w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">แก้ไข: {editing.name} <span className="text-xs font-normal text-slate-400">({editing.code})</span></h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={saveEdit} className="grid grid-cols-2 gap-3">
              <Field label="ชื่อ-สกุล"><input className={inputCls} value={ef.name} onChange={(e) => setE("name", e.target.value)} /></Field>
              <Field label="บทบาท (สิทธิ)"><Select value={ef.role} onChange={(e) => setE("role", e.target.value)}>{ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</Select></Field>
              <Field label="แผนก"><Select value={ef.department} onChange={(e) => setE("department", e.target.value)}>{DEPTS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}</Select></Field>
              <Field label="ตำแหน่ง"><input className={inputCls} value={ef.position} onChange={(e) => setE("position", e.target.value)} /></Field>
              <Field label="สาขา"><Select value={ef.branch_id} onChange={(e) => setE("branch_id", e.target.value)}>{org.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
              <Field label="กะ"><Select value={ef.shift_id} onChange={(e) => setE("shift_id", e.target.value)}>{org.shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="ประเภทค่าจ้าง"><Select value={ef.pay_type} onChange={(e) => setE("pay_type", e.target.value)}><option value="monthly">รายเดือน</option><option value="daily">รายวัน</option></Select></Field>
              <Field label="เงินเดือน/ค่าจ้าง"><input type="number" min="0" className={inputCls} value={ef.base_salary} onChange={(e) => setE("base_salary", e.target.value)} /></Field>
              <Field label="ประกันสังคม">
                <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                  <input type="checkbox" checked={ef.sso} onChange={(e) => setE("sso", e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                  <span>{ef.sso ? "หัก สปส. 5%" : "ไม่หัก สปส."}</span>
                </label>
              </Field>
              <div className="col-span-2 my-1 border-t border-slate-100 pt-2 text-xs font-medium text-slate-400">เปลี่ยนล็อกอิน (เว้นว่าง = คงเดิม)</div>
              <Field label="Username ใหม่"><input className={inputCls} value={ef.username} onChange={(e) => setE("username", e.target.value)} autoCapitalize="none" placeholder="เว้นว่าง = ไม่เปลี่ยน" /></Field>
              <Field label="รหัสผ่านใหม่"><input className={inputCls} value={ef.password} onChange={(e) => setE("password", e.target.value)} placeholder="เว้นว่าง = ไม่เปลี่ยน" /></Field>
              <div className="col-span-2">
                {eMsg && <p className={`mb-2 text-sm ${eMsg.ok ? "text-emerald-600" : "text-rose-500"}`}>{eMsg.text}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={eBusy} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white ${eBusy ? "bg-slate-300" : "bg-emerald-600 active:bg-emerald-700"}`}>{eBusy ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-500 ring-1 ring-slate-200">ยกเลิก</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </Page>
  );
}
