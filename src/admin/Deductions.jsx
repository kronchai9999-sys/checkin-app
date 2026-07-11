import { useState, useEffect } from "react";
import { listEmployees, saveDeduction, listDeductions } from "../lib/db.js";
import { DEMO_EMPLOYEES } from "../lib/demo.js";
import { isManager } from "../lib/rules.js";

const TH = { fontFamily: '"Sarabun","Noto Sans Thai","Prompt",sans-serif' };
const PERIODS = ["กรกฎาคม 2026", "สิงหาคม 2026", "กันยายน 2026"];
const TYPES = ["ทำของเสียหาย", "เงินขาด (แคชเชียร์)", "เบิกล่วงหน้า", "อื่นๆ"];
const baht = (n) => (Math.round(n * 100) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Deductions({ employee }) {
  const manager = isManager(employee?.role);
  const [emps, setEmps] = useState(DEMO_EMPLOYEES);
  const [period, setPeriod] = useState(PERIODS[0]);
  const [empId, setEmpId] = useState(DEMO_EMPLOYEES[2]?.id);
  const [type, setType] = useState(TYPES[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);       // {ok|err, text}
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listEmployees().then((list) => { if (list && list.length) { setEmps(list); setEmpId(list[0].id); } });
  }, []);

  useEffect(() => { refresh(); }, [period]);
  async function refresh() {
    const data = await listDeductions(period);
    setRows(data || []);
  }

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    const amt = Number(amount);
    if (!empId || !amt || amt <= 0) { setMsg({ ok: false, text: "กรอกพนักงานและจำนวนเงินให้ถูกต้อง" }); return; }
    setBusy(true); setMsg(null);
    const res = await saveDeduction({
      employeeId: empId, period, type, amount: amt, note,
      createdBy: employee?.id, createdByName: employee?.name,
    });
    setBusy(false);
    if (res?.error) { setMsg({ ok: false, text: "บันทึกไม่สำเร็จ: " + res.error }); return; }
    if (res?.demo) {
      // โหมดเดโม — เพิ่มลงตารางในเครื่อง
      setRows([{ id: Math.random().toString(36).slice(2), employee_id: empId, period, type, amount: amt, note, created_by_name: employee?.name, created_at: new Date().toISOString() }, ...rows]);
    } else {
      await refresh();
    }
    setMsg({ ok: true, text: "บันทึกหักเงินเรียบร้อย" });
    setAmount(""); setNote("");
  }

  const empName = (id) => emps.find((e) => e.id === id)?.name || id;
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  if (!manager) {
    return <Blocked text="หน้าบันทึกหักเงินสำหรับหัวหน้า/ผู้บริหารเท่านั้น" />;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6" style={TH}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">บันทึกหักเงิน</h1>
          <p className="text-sm text-slate-500">รายการหักจะไปแสดงในสลิปเงินเดือนของงวดนั้น</p>

          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="งวด">
                <select value={period} onChange={(e) => setPeriod(e.target.value)} className={inputCls}>
                  {PERIODS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="พนักงาน">
                <select value={empId} onChange={(e) => setEmpId(e.target.value)} className={inputCls}>
                  {emps.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
                </select>
              </Field>
              <Field label="ประเภทการหัก">
                <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                  {TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="จำนวนเงิน (บาท)">
                <input type="number" inputMode="decimal" min="0" value={amount}
                  onChange={(e) => setAmount(e.target.value)} className={inputCls} placeholder="0" />
              </Field>
            </div>
            <Field label="หมายเหตุ">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls}
                placeholder="เช่น ทำจานแตก 2 ใบ (ถ้ามี)" />
            </Field>

            {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-rose-500"}`}>{msg.text}</p>}

            <button type="submit" disabled={busy}
              className={`w-full rounded-xl py-3 text-sm font-semibold text-white ${busy ? "bg-slate-300" : "bg-rose-600 active:bg-rose-700"}`}>
              {busy ? "กำลังบันทึก…" : "บันทึกรายการหัก"}
            </button>
          </form>
        </div>

        {/* รายการงวดนี้ */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">รายการงวดนี้ ({rows.length})</h2>
            <span className="text-sm font-bold text-rose-600">รวม -{baht(total)} ฿</span>
          </div>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">ยังไม่มีรายการหักงวดนี้</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium text-slate-800">{empName(r.employee_id)} · {r.type}</div>
                    <div className="text-xs text-slate-400">
                      {r.note || "—"}{r.created_by_name ? ` · โดย ${r.created_by_name}` : ""}
                    </div>
                  </div>
                  <span className="tabular-nums font-semibold text-rose-600">-{baht(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls = "mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-amber-500";
function Field({ label, children }) {
  return <label className="block"><span className="text-xs text-slate-500">{label}</span>{children}</label>;
}
export function Blocked({ text }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8 text-center" style={TH}>
      <div className="rounded-2xl bg-white px-6 py-8 text-slate-500 shadow-sm">🔒 {text}</div>
    </div>
  );
}
