import { useState, useEffect, useMemo } from "react";
import { listEmployees, fetchOrg, fetchPeriodPunches, createApproval, listWaiversRange } from "./lib/db.js";
import { isSupabaseReady } from "./lib/supabase.js";
import { DEMO_EMPLOYEES, DEMO_ORG, demoPunches } from "./lib/demo.js";
import { PERIODS, monthRange, buildCalendar, summarizePayroll, baht, round2 } from "./lib/payroll.js";
import { RULES, isManager } from "./lib/rules.js";
import { Page, PageHeader, Card, Stat, Select, Field, inputCls, DemoTag } from "./ui.jsx";

const REQ_TYPES = [
  { id: "leave", label: "ขอลา" },
  { id: "shift_change", label: "ขอเปลี่ยนกะ" },
  { id: "time_edit", label: "ขอแก้เวลาทำงาน" },
  { id: "ot_edit", label: "ขอแก้ OT" },
];

export default function Timesheet({ employee }) {
  const manager = isManager(employee?.role);
  const [emps, setEmps] = useState(DEMO_EMPLOYEES);
  const [shifts, setShifts] = useState(DEMO_ORG.shifts);
  const [period, setPeriod] = useState(PERIODS[0]);
  const [empId, setEmpId] = useState(employee?.id || DEMO_EMPLOYEES[2].id);
  const [logs, setLogs] = useState([]);
  const [waivers, setWaivers] = useState(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listEmployees().then((l) => l && l.length && setEmps(l));
    fetchOrg().then((o) => o && setShifts(o.shifts));
  }, []);

  // พนักงานธรรมดา = ดูของตัวเองเท่านั้น
  const viewId = manager ? empId : employee?.id || empId;
  const emp = emps.find((e) => e.id === viewId) || emps[0];
  const shift = shifts.find((s) => s.id === emp?.shift_id) || shifts[0];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const fromDate = `${period.year}-${String(period.month).padStart(2, "0")}-01`;
      const toDate = `${period.year}-${String(period.month).padStart(2, "0")}-31`;
      if (isSupabaseReady && emp?.id) {
        const { fromISO, toISO } = monthRange(period);
        const [data, wv] = await Promise.all([
          fetchPeriodPunches(emp.id, fromISO, toISO),
          listWaiversRange(fromDate, toDate),
        ]);
        if (alive) {
          setLogs(data || []);
          setWaivers(new Map((wv || []).filter((w) => w.employee_id === emp.id).map((w) => [w.waive_date, w.kind])));
          setLoading(false);
        }
      } else {
        if (alive) { setLogs(demoPunches(emp, period)); setWaivers(new Map()); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [viewId, period, emp?.id]);

  const days = useMemo(() => buildCalendar(logs, shift, emp?.off_days, period), [logs, shift, emp?.off_days, period]);
  const t = useMemo(() => summarizePayroll(days, waivers), [days, waivers]);

  // ยื่นคำขอ → เข้าคิวอนุมัติ
  const [reqType, setReqType] = useState(REQ_TYPES[0].id);
  const [reqDetail, setReqDetail] = useState("");
  const [reqMsg, setReqMsg] = useState(null);
  const [reqBusy, setReqBusy] = useState(false);
  async function sendRequest(e) {
    e?.preventDefault();
    if (reqBusy || !reqDetail.trim()) return;
    setReqBusy(true); setReqMsg(null);
    const res = await createApproval({ requestType: reqType, employeeId: employee?.id, detail: reqDetail.trim() });
    setReqBusy(false);
    if (res?.error) { setReqMsg({ ok: false, text: "ส่งไม่สำเร็จ: " + res.error }); return; }
    setReqMsg({ ok: true, text: "ส่งคำขอแล้ว — รอหัวหน้าอนุมัติ" });
    setReqDetail("");
  }

  return (
    <Page>
      <PageHeader icon="🗓️" title="ตารางเวลาทำงาน" accent="sky"
        subtitle={`${period.label} · ${shift?.name || ""} ${shift?.start_time || ""}–${shift?.end_time || ""} น.`} />
      {!isSupabaseReady && <DemoTag />}

      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="งวด">
            <Select value={period.label} onChange={(e) => setPeriod(PERIODS.find((p) => p.label === e.target.value))}>
              {PERIODS.map((p) => <option key={p.label}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="พนักงาน">
            <Select value={viewId} onChange={(e) => setEmpId(e.target.value)} disabled={!manager}>
              {(manager ? emps : emps.filter((e) => e.id === employee?.id)).map((e) => (
                <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
              ))}
            </Select>
          </Field>
        </div>
        {!manager && <p className="mt-2 text-xs text-slate-400">คุณดูได้เฉพาะเวลาของตัวเอง</p>}
      </Card>

      <Card className="mb-4 !p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                <th className="px-3 py-2.5 text-left">วันที่</th>
                <th className="px-2 py-2.5">เข้า</th>
                <th className="px-2 py-2.5">พักออก</th>
                <th className="px-2 py-2.5">พักเข้า</th>
                <th className="px-2 py-2.5">เลิก</th>
                <th className="px-2 py-2.5">สาย</th>
                <th className="px-2 py-2.5">OT</th>
                <th className="px-2 py-2.5">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">กำลังโหลด…</td></tr>
              ) : days.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">ยังไม่มีข้อมูลตอกบัตรงวดนี้</td></tr>
              ) : days.map((d, i) => {
                const waived = waivers.get(d.dateKey);
                return (
                  <tr key={i} className={`border-b border-slate-50 ${d.isOff ? "bg-slate-50/60" : d.absent ? "bg-rose-50/40" : ""}`}>
                    <td className="px-3 py-2 font-medium text-slate-700">{d.dateLabel}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-slate-600">{d.in}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-slate-400">{d.lunchOut}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-slate-400">{d.lunchIn}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-slate-600">{d.out}</td>
                    <td className={`px-2 py-2 text-center tabular-nums ${d.lateMin > 0 ? "font-semibold text-rose-600" : "text-slate-300"}`}>{d.lateMin > 0 ? `${d.lateMin}′` : "-"}</td>
                    <td className={`px-2 py-2 text-center tabular-nums ${d.otMin > 0 ? "font-semibold text-amber-600" : "text-slate-300"}`}>{d.otMin > 0 ? `${round2(d.otMin / 60)}ช` : "-"}</td>
                    <td className="px-2 py-2 text-center text-xs">
                      {d.isOff ? <span className="text-slate-400">หยุดประจำสัปดาห์</span>
                        : d.absent ? <span className="font-semibold text-rose-600">ขาด{waived ? " · ไม่หัก" : ""}</span>
                        : waived && d.lateMin > 0 ? <span className="text-emerald-600">ไม่หักสาย</span>
                        : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="วันมาทำงาน" value={`${t.presentDays} วัน`} />
        <Stat label="ขาดงาน" value={`${t.absentDays} วัน`} tone={t.absentDays > 0 ? "rose" : "slate"} />
        <Stat label="สายสะสม" value={`${t.lateTotal} น.`} tone={t.lateTotal > RULES.lateGraceMinutesPerMonth ? "rose" : "slate"} />
        <Stat label="OT รวม" value={`${round2(t.otHours)} ชม.`} tone="amber" />
        <Stat label="เงิน OT" value={`${baht(t.otPay)}`} tone="amber" />
      </div>

      <Card>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">หักมาสาย (เกินผ่อนผัน {RULES.lateGraceMinutesPerMonth} น. → {t.lateChargeable} น. × {RULES.lateRatePerMinute})</span>
          <span className="font-semibold text-rose-600">- {baht(t.lateDeduct)}</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">* OT ปัดเป็นชั่วโมงเต็ม (เศษ ≥ {RULES.otRoundUpAtMinutes} น. ปัดขึ้น 1 ชม.) — ยอดนี้ส่งเข้าสลิปอัตโนมัติ</p>
      </Card>

      {/* ยื่นคำขอ (ลา/เปลี่ยนกะ/แก้เวลา) → เข้าคิวให้หัวหน้าอนุมัติ */}
      <Card className="mt-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">ยื่นคำขอถึงหัวหน้า</h2>
        <form onSubmit={sendRequest} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="ประเภทคำขอ">
              <Select value={reqType} onChange={(e) => setReqType(e.target.value)}>
                {REQ_TYPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </Select>
            </Field>
            <Field label="รายละเอียด">
              <input value={reqDetail} onChange={(e) => setReqDetail(e.target.value)} className={inputCls} placeholder="เช่น ลากิจ 12 ก.ค." />
            </Field>
          </div>
          {reqMsg && <p className={`text-sm ${reqMsg.ok ? "text-emerald-600" : "text-rose-500"}`}>{reqMsg.text}</p>}
          <button type="submit" disabled={reqBusy || !reqDetail.trim()} className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white ${reqBusy || !reqDetail.trim() ? "bg-slate-300" : "bg-sky-600 active:bg-sky-700"}`}>
            {reqBusy ? "กำลังส่ง…" : "ส่งคำขอ"}
          </button>
          <p className="text-xs text-slate-400">“แก้เวลาทำงาน/แก้ OT” หัวหน้าอนุมัติไม่ได้ ต้องผู้บริหาร (ตามกติกา)</p>
        </form>
      </Card>
    </Page>
  );
}
