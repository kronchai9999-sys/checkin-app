import { useState, useEffect } from "react";
import { listEmployees, createApproval, listApprovalsForEmployee, getManualOtMinutes, updateEmployee } from "./lib/db.js";
import { isSupabaseReady } from "./lib/supabase.js";
import { DEMO_EMPLOYEES } from "./lib/demo.js";
import { PERIODS, currentPeriod, otRateFor, baht, round2 } from "./lib/payroll.js";
import { RULES, isManager, isExec } from "./lib/rules.js";
import { Page, PageHeader, Card, Select, Field, inputCls, DemoTag } from "./ui.jsx";

export default function OT({ employee }) {
  const manager = isManager(employee?.role);
  const execView = isExec(employee?.role);
  const [emps, setEmps] = useState(isSupabaseReady ? [] : DEMO_EMPLOYEES);
  const [period, setPeriod] = useState(currentPeriod());
  const [empId, setEmpId] = useState(employee?.id || "");
  const [manualOtMin, setManualOtMin] = useState(0);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { listEmployees().then((l) => l && l.length && setEmps(l)); }, []);

  const viewId = manager ? (empId || employee?.id) : employee?.id;
  const emp = emps.find((e) => e.id === viewId) || emps[0];
  const rate = otRateFor(emp);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      if (isSupabaseReady && emp?.id) {
        const [otm, hist] = await Promise.all([
          getManualOtMinutes(emp.id, period.label),
          listApprovalsForEmployee(emp.id),
        ]);
        if (alive) {
          setManualOtMin(otm || 0);
          setHistory((hist || []).filter((r) => r.request_type === "ot_edit"));
          setLoading(false);
        }
      } else if (alive) {
        setManualOtMin(0); setHistory([]); setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [emp?.id, period]);

  const otHours = manualOtMin / 60;
  const otPay = otHours * rate;

  // ยื่นขอ OT
  const [reqDate, setReqDate] = useState("");
  const [reqMinutes, setReqMinutes] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [reqMsg, setReqMsg] = useState(null);
  const [reqBusy, setReqBusy] = useState(false);

  async function refreshHistory() {
    if (!isSupabaseReady || !employee?.id) return;
    const l = await listApprovalsForEmployee(employee.id);
    setHistory((l || []).filter((r) => r.request_type === "ot_edit"));
  }

  async function sendRequest(e) {
    e?.preventDefault();
    if (reqBusy) return;
    if (!reqDate || !reqMinutes) { setReqMsg({ ok: false, text: "เลือกวันที่และจำนวนนาที OT" }); return; }
    const note = reqNote.trim();
    const detail = `ขอ OT วันที่ ${reqDate} จำนวน ${reqMinutes} นาที${note ? " · " + note : ""}`;
    setReqBusy(true); setReqMsg(null);
    const res = await createApproval({ requestType: "ot_edit", employeeId: employee?.id, detail, payload: { date: reqDate, minutes: Number(reqMinutes) } });
    setReqBusy(false);
    if (res?.error) { setReqMsg({ ok: false, text: "ส่งไม่สำเร็จ: " + res.error }); return; }
    setReqMsg({ ok: true, text: "ส่งคำขอแล้ว — รอผู้บริหารอนุมัติ" });
    setReqDate(""); setReqMinutes(""); setReqNote("");
    refreshHistory();
  }

  // ผู้บริหาร: ตั้งอัตรา OT รายคน (ไม่ตั้ง = ใช้อัตรามาตรฐาน)
  const [rateInputs, setRateInputs] = useState({});
  const [rateBusy, setRateBusy] = useState(null);
  const [rateSaved, setRateSaved] = useState(null);

  async function saveRate(e) {
    const raw = rateInputs[e.id];
    setRateBusy(e.id);
    const patch = raw === "" || raw == null ? { clearOtRate: true } : { ot_rate: Number(raw) };
    await updateEmployee(e.id, patch);
    const list = await listEmployees();
    if (list) setEmps(list);
    setRateBusy(null);
    setRateSaved(e.id);
    setTimeout(() => setRateSaved((s) => (s === e.id ? null : s)), 1500);
  }

  return (
    <Page>
      <PageHeader icon="⏱️" title="โอที" accent="amber"
        subtitle={execView ? "ตั้งอัตรา OT รายคน · ดู/อนุมัติคำขอ" : "ยื่นขอ OT และดูประวัติ"} />
      {!isSupabaseReady && <DemoTag />}

      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="งวด">
            <Select value={period.label} onChange={(e) => setPeriod(PERIODS.find((p) => p.label === e.target.value))}>
              {PERIODS.map((p) => <option key={p.label}>{p.label}</option>)}
            </Select>
          </Field>
          {manager && (
            <Field label="พนักงาน">
              <Select value={viewId} onChange={(e) => setEmpId(e.target.value)}>
                {emps.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
              </Select>
            </Field>
          )}
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">สรุป OT งวดนี้ ({period.label})</h2>
        {loading ? (
          <div className="py-4 text-center text-sm text-slate-400">กำลังโหลด…</div>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 py-2">
              <div className="text-xs text-slate-400">นาที OT</div>
              <div className="text-lg font-bold tabular-nums text-slate-800">{manualOtMin}</div>
            </div>
            <div className="rounded-xl bg-slate-50 py-2">
              <div className="text-xs text-slate-400">ชั่วโมง</div>
              <div className="text-lg font-bold tabular-nums text-slate-800">{round2(otHours)}</div>
            </div>
            <div className="rounded-xl bg-amber-50 py-2">
              <div className="text-xs text-slate-400">เงิน OT (฿{rate}/ชม.)</div>
              <div className="text-lg font-bold tabular-nums text-amber-700">{baht(otPay)}</div>
            </div>
          </div>
        )}
      </Card>

      {execView && (
        <Card className="mb-4 !p-0">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">อัตรา OT รายคน</div>
          {emps.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 border-b border-slate-50 px-4 py-3 last:border-0">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{e.name}</div>
                <div className="text-xs text-slate-400">{e.code} · ปกติ ฿{RULES.otRatePerHour}/ชม.</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input type="number" min="0" placeholder={String(RULES.otRatePerHour)}
                  value={rateInputs[e.id] ?? (e.ot_rate ?? "")}
                  onChange={(ev) => setRateInputs((r) => ({ ...r, [e.id]: ev.target.value }))}
                  className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm outline-none focus:border-amber-500" />
                <button onClick={() => saveRate(e)} disabled={rateBusy === e.id}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-amber-700 disabled:bg-slate-300">
                  {rateBusy === e.id ? "…" : "บันทึก"}
                </button>
                {rateSaved === e.id && <span className="text-xs text-emerald-600">✓</span>}
              </div>
            </div>
          ))}
          <p className="px-4 py-2 text-xs text-slate-400">* เว้นว่างช่อง = ใช้อัตรามาตรฐาน ฿{RULES.otRatePerHour}/ชม.</p>
        </Card>
      )}

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">ยื่นขอ OT</h2>
        <form onSubmit={sendRequest} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="วันที่"><input type="date" className={inputCls} value={reqDate} onChange={(e) => setReqDate(e.target.value)} /></Field>
            <Field label="จำนวน OT (นาที)"><input type="number" min="1" className={inputCls} value={reqMinutes} onChange={(e) => setReqMinutes(e.target.value)} /></Field>
          </div>
          <Field label="หมายเหตุ (ถ้ามี)">
            <input value={reqNote} onChange={(e) => setReqNote(e.target.value)} className={inputCls} placeholder="เช่น เหตุผลเพิ่มเติม" />
          </Field>
          {reqMsg && <p className={`text-sm ${reqMsg.ok ? "text-emerald-600" : "text-rose-500"}`}>{reqMsg.text}</p>}
          <button type="submit" disabled={reqBusy} className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white ${reqBusy ? "bg-slate-300" : "bg-amber-600 active:bg-amber-700"}`}>
            {reqBusy ? "กำลังส่ง…" : "ส่งคำขอ"}
          </button>
          <p className="text-xs text-slate-400">คำขอ OT ต้องผู้บริหารอนุมัติ — อนุมัติแล้วระบบเพิ่ม OT ให้อัตโนมัติ</p>
        </form>
      </Card>

      {history.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">ประวัติคำขอ OT</h2>
          <div className="divide-y divide-slate-100">
            {history.map((r) => (
              <div key={r.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-700">
                    {r.detail}
                    <span className="ml-1 text-xs text-slate-400">· ขอโดย {emp?.name}</span>
                  </span>
                  <span className={r.status === "approved" ? "text-emerald-600" : r.status === "rejected" ? "text-rose-500" : "text-amber-600"}>
                    {r.status === "approved" ? "อนุมัติแล้ว" : r.status === "rejected" ? "ไม่อนุมัติ" : "รออนุมัติ"}
                    {r.approver_name ? ` โดย ${r.approver_name}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Page>
  );
}
