import { useState, useEffect } from "react";
import { listEmployees, saveDeduction, listDeductions } from "../lib/db.js";
import { isSupabaseReady } from "../lib/supabase.js";
import { DEMO_EMPLOYEES } from "../lib/demo.js";
import { PERIODS, baht } from "../lib/payroll.js";
import { isManager } from "../lib/rules.js";
import { Page, PageHeader, Card, Select, Field, inputCls, Empty, DemoTag } from "../ui.jsx";

const TYPES = ["ทำของเสียหาย", "เงินขาด (แคชเชียร์)", "เบิกล่วงหน้า", "อื่นๆ"];

export default function Deductions({ employee }) {
  const manager = isManager(employee?.role);
  const [emps, setEmps] = useState(DEMO_EMPLOYEES);
  const [period, setPeriod] = useState(PERIODS[0].label);
  const [empId, setEmpId] = useState(DEMO_EMPLOYEES[2]?.id);
  const [type, setType] = useState(TYPES[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listEmployees().then((l) => { if (l && l.length) { setEmps(l); setEmpId(l[0].id); } });
  }, []);
  useEffect(() => { listDeductions(period).then((d) => setRows(d || [])); }, [period]);

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    const amt = Number(amount);
    if (!empId || !amt || amt <= 0) { setMsg({ ok: false, text: "กรอกพนักงานและจำนวนเงินให้ถูกต้อง" }); return; }
    setBusy(true); setMsg(null);
    const res = await saveDeduction({ employeeId: empId, period, type, amount: amt, note, createdBy: employee?.id, createdByName: employee?.name });
    setBusy(false);
    if (res?.error) { setMsg({ ok: false, text: "บันทึกไม่สำเร็จ: " + res.error }); return; }
    if (res?.demo) {
      setRows([{ id: Math.random().toString(36).slice(2), employee_id: empId, period, type, amount: amt, note, created_by_name: employee?.name, created_at: new Date().toISOString() }, ...rows]);
    } else {
      setRows((await listDeductions(period)) || []);
    }
    setMsg({ ok: true, text: "บันทึกหักเงินเรียบร้อย" });
    setAmount(""); setNote("");
  }

  const empName = (id) => emps.find((e) => e.id === id)?.name || id;
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  if (!manager) return <Page><PageHeader icon="🔒" title="บันทึกหักเงิน" accent="rose" /><Card><Empty>สำหรับหัวหน้า/ผู้บริหารเท่านั้น</Empty></Card></Page>;

  return (
    <Page>
      <PageHeader icon="➖" title="บันทึกหักเงิน" accent="rose" subtitle="รายการหักจะไปแสดงในสลิปงวดนั้นอัตโนมัติ" />
      {!isSupabaseReady && <DemoTag />}

      <Card className="mb-4">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="งวด"><Select value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map((p) => <option key={p.label}>{p.label}</option>)}</Select></Field>
            <Field label="พนักงาน"><Select value={empId} onChange={(e) => setEmpId(e.target.value)}>{emps.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}</Select></Field>
            <Field label="ประเภทการหัก"><Select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="จำนวนเงิน (บาท)"><input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} placeholder="0" /></Field>
          </div>
          <Field label="หมายเหตุ"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="เช่น ทำจานแตก 2 ใบ (ถ้ามี)" /></Field>
          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-rose-500"}`}>{msg.text}</p>}
          <button type="submit" disabled={busy} className={`w-full rounded-xl py-3 text-sm font-semibold text-white ${busy ? "bg-slate-300" : "bg-rose-600 active:bg-rose-700"}`}>{busy ? "กำลังบันทึก…" : "บันทึกรายการหัก"}</button>
        </form>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">รายการงวดนี้ ({rows.length})</h2>
          <span className="text-sm font-bold text-rose-600">รวม -{baht(total)} ฿</span>
        </div>
        {rows.length === 0 ? <Empty>ยังไม่มีรายการหักงวดนี้</Empty> : (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium text-slate-800">{empName(r.employee_id)} · {r.type}</div>
                  <div className="text-xs text-slate-400">{r.note || "—"}{r.created_by_name ? ` · โดย ${r.created_by_name}` : ""}</div>
                </div>
                <span className="tabular-nums font-semibold text-rose-600">-{baht(r.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}
