import { useState, useEffect } from "react";
import { fetchOrg, saveShiftType, deleteShiftType } from "../lib/db.js";
import { isSupabaseReady } from "../lib/supabase.js";
import { DEMO_ORG } from "../lib/demo.js";
import { canManageShiftTypes } from "../lib/rules.js";
import { Page, PageHeader, Card, Field, inputCls, Empty, DemoTag } from "../ui.jsx";

const COMPANY_ID = "bakery";
const blank = { name: "", start_time: "08:00", end_time: "17:00", lunch_minutes: 60 };

export default function ShiftTypes({ employee }) {
  const allowed = canManageShiftTypes(employee?.role);
  const [shifts, setShifts] = useState(DEMO_ORG.shifts);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const o = await fetchOrg();
    if (o) setShifts(o.shifts);
  }
  useEffect(() => { refresh(); }, []);

  async function addShift(e) {
    e?.preventDefault();
    if (busy) return;
    if (!form.name.trim()) { setMsg({ ok: false, text: "กรอกชื่อกะ" }); return; }
    setBusy(true); setMsg(null);
    const shift = {
      id: "s" + Date.now().toString(36), company_id: COMPANY_ID, name: form.name.trim(),
      start_time: form.start_time, end_time: form.end_time, lunch_minutes: Number(form.lunch_minutes) || 0,
    };
    const res = await saveShiftType(shift);
    setBusy(false);
    if (res?.error) { setMsg({ ok: false, text: "เพิ่มไม่สำเร็จ: " + res.error }); return; }
    if (res?.demo) setShifts((s) => [...s, shift]); else await refresh();
    setMsg({ ok: true, text: `เพิ่มกะ "${shift.name}" แล้ว` });
    setForm(blank);
  }

  async function patchShift(s, patch) {
    const next = { ...s, ...patch };
    setShifts((list) => list.map((x) => (x.id === s.id ? next : x)));
    await saveShiftType({ id: s.id, company_id: s.company_id || COMPANY_ID, name: next.name, start_time: next.start_time, end_time: next.end_time, lunch_minutes: Number(next.lunch_minutes) || 0 });
  }
  async function removeShift(s) {
    if (shifts.length <= 1) { setMsg({ ok: false, text: "ต้องมีอย่างน้อย 1 กะ" }); return; }
    setShifts((list) => list.filter((x) => x.id !== s.id));
    const res = await deleteShiftType(s.id);
    if (res?.error) { setMsg({ ok: false, text: "ลบไม่สำเร็จ (อาจมีพนักงานผูกกะนี้อยู่): " + res.error }); await refresh(); }
  }

  if (!allowed) return <Page><PageHeader icon="🔒" title="ตั้งเวลากะ" accent="amber" /><Card><Empty>เฉพาะผู้บริหารเท่านั้น</Empty></Card></Page>;

  return (
    <Page>
      <PageHeader icon="⏰" title="ตั้งเวลากะ" accent="amber" subtitle="เพิ่ม/แก้เวลาเข้า-เลิกงานและพักเที่ยงของแต่ละกะ" />
      {!isSupabaseReady && <DemoTag />}

      {/* เพิ่มกะใหม่ */}
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">เพิ่มกะใหม่</h2>
        <form onSubmit={addShift} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="ชื่อกะ"><input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="เช่น กะดึก" /></Field>
          <Field label="เวลาเข้า"><input type="time" className={inputCls} value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} /></Field>
          <Field label="เวลาเลิก"><input type="time" className={inputCls} value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} /></Field>
          <Field label="พักเที่ยง (นาที)"><input type="number" min="0" className={inputCls} value={form.lunch_minutes} onChange={(e) => setForm((f) => ({ ...f, lunch_minutes: e.target.value }))} /></Field>
          <div className="col-span-2 sm:col-span-4">
            {msg && <p className={`mb-2 text-sm ${msg.ok ? "text-emerald-600" : "text-rose-500"}`}>{msg.text}</p>}
            <button type="submit" disabled={busy} className={`w-full rounded-xl py-3 text-sm font-semibold text-white ${busy ? "bg-slate-300" : "bg-emerald-600 active:bg-emerald-700"}`}>{busy ? "กำลังเพิ่ม…" : "➕ เพิ่มกะ"}</button>
          </div>
        </form>
      </Card>

      {/* รายการกะ */}
      <Card className="!p-0">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">กะทั้งหมด ({shifts.length})</div>
        {shifts.map((s) => (
          <div key={s.id} className="grid grid-cols-2 gap-2 border-b border-slate-50 px-4 py-3 last:border-0 sm:grid-cols-5 sm:items-end">
            <Field label="ชื่อกะ"><input className={inputCls} defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && patchShift(s, { name: e.target.value })} /></Field>
            <Field label="เวลาเข้า"><input type="time" className={inputCls} defaultValue={s.start_time} onBlur={(e) => e.target.value !== s.start_time && patchShift(s, { start_time: e.target.value })} /></Field>
            <Field label="เวลาเลิก"><input type="time" className={inputCls} defaultValue={s.end_time} onBlur={(e) => e.target.value !== s.end_time && patchShift(s, { end_time: e.target.value })} /></Field>
            <Field label="พักเที่ยง (นาที)"><input type="number" min="0" className={inputCls} defaultValue={s.lunch_minutes} onBlur={(e) => Number(e.target.value) !== s.lunch_minutes && patchShift(s, { lunch_minutes: e.target.value })} /></Field>
            <button onClick={() => removeShift(s)} className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-500 ring-1 ring-rose-200">ลบกะนี้</button>
          </div>
        ))}
      </Card>
      <p className="mt-3 px-1 text-xs text-slate-400">* แก้เวลาแล้วคลิกออกจากช่องเพื่อบันทึกอัตโนมัติ · เวลานี้ใช้คำนวณ "สาย" และ "OT" ในตารางเวลา/สลิปทันที</p>
    </Page>
  );
}
