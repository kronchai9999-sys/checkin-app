import { useState, useEffect, useMemo } from "react";
import { listEmployees, fetchOrg, fetchPeriodPunches, createApproval, listWaiversRange, listLeaveLogsForEmployee, getManualOtMinutes, applyTimeEdit, deleteAttendanceLog } from "./lib/db.js";
import { isSupabaseReady } from "./lib/supabase.js";
import { DEMO_EMPLOYEES, DEMO_ORG, demoPunches } from "./lib/demo.js";
import { PERIODS, monthRange, buildCalendar, summarizePayroll, applyManualOt, currentPeriod, baht, round2 } from "./lib/payroll.js";
import { RULES, isManager, isExec } from "./lib/rules.js";
import { Page, PageHeader, Card, Stat, Select, Field, inputCls, DemoTag } from "./ui.jsx";

const REQ_TYPES = [
  { id: "leave", label: "ขอลา" },
  { id: "shift_change", label: "ขอเปลี่ยนกะ" },
  { id: "time_edit", label: "ขอแก้เวลาทำงาน" },
  { id: "ot_edit", label: "ขอแก้ OT" },
];
const LEAVE_TYPES = [
  { v: "sick", l: "ลาป่วย" },
  { v: "personal", l: "ลากิจ" },
  { v: "vacation", l: "ลาพักร้อน" },
];
const PUNCH_TYPES = [
  { v: "in", l: "เข้างาน" },
  { v: "out", l: "เลิกงาน" },
  { v: "lunch_out", l: "พักเที่ยง (ออก)" },
  { v: "lunch_in", l: "พักเที่ยง (เข้า)" },
];
const pad2 = (n) => String(n).padStart(2, "0");
// "8:10" -> "08:10" (สำหรับใส่ใน <input type="time">) · "-" -> ""
function toInputTime(fmt) {
  if (!fmt || fmt === "-") return "";
  const [h, m] = fmt.split(":");
  return `${pad2(Number(h))}:${m}`;
}

export default function Timesheet({ employee }) {
  const manager = isManager(employee?.role);
  const execView = isExec(employee?.role);   // ผู้บริหารแก้/ลบเวลาการตอกบัตรได้โดยตรง ไม่ต้องผ่านอนุมัติ
  const [emps, setEmps] = useState(DEMO_EMPLOYEES);
  const [shifts, setShifts] = useState(DEMO_ORG.shifts);
  const [period, setPeriod] = useState(currentPeriod());
  const [empId, setEmpId] = useState(employee?.id || DEMO_EMPLOYEES[2].id);
  const [logs, setLogs] = useState([]);
  const [waivers, setWaivers] = useState(new Map());
  const [leaveLogs, setLeaveLogs] = useState([]);
  const [manualOtMin, setManualOtMin] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listEmployees().then((l) => l && l.length && setEmps(l));
    fetchOrg().then((o) => o && setShifts(o.shifts));
  }, []);

  // พนักงานธรรมดา = ดูของตัวเองเท่านั้น
  const viewId = manager ? empId : employee?.id || empId;
  const emp = emps.find((e) => e.id === viewId) || emps[0];
  const shift = shifts.find((s) => s.id === emp?.shift_id) || shifts[0];

  async function refreshLogs() {
    if (!isSupabaseReady || !emp?.id) return;
    const { fromISO, toISO } = monthRange(period);
    const data = await fetchPeriodPunches(emp.id, fromISO, toISO);
    setLogs(data || []);
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const fromDate = `${period.year}-${String(period.month).padStart(2, "0")}-01`;
      const toDate = `${period.year}-${String(period.month).padStart(2, "0")}-31`;
      if (isSupabaseReady && emp?.id) {
        const { fromISO, toISO } = monthRange(period);
        const [data, wv, ll, otm] = await Promise.all([
          fetchPeriodPunches(emp.id, fromISO, toISO),
          listWaiversRange(fromDate, toDate),
          listLeaveLogsForEmployee(emp.id),
          getManualOtMinutes(emp.id, period.label),
        ]);
        if (alive) {
          setLogs(data || []);
          setWaivers(new Map((wv || []).filter((w) => w.employee_id === emp.id).map((w) => [w.waive_date, w.kind])));
          setLeaveLogs(ll || []);
          setManualOtMin(otm || 0);
          setLoading(false);
        }
      } else {
        if (alive) { setLogs(demoPunches(emp, period)); setWaivers(new Map()); setLeaveLogs([]); setManualOtMin(0); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [viewId, period, emp?.id]);

  const days = useMemo(() => buildCalendar(logs, shift, emp?.off_days, period), [logs, shift, emp?.off_days, period]);
  const t = useMemo(() => applyManualOt(summarizePayroll(days, waivers), manualOtMin), [days, waivers, manualOtMin]);

  // ล็อกอัพ dateKey+ประเภท → id ของแถวจริงใน attendance_logs (สำหรับผู้บริหารแก้/ลบตรง)
  const punchIndex = useMemo(() => {
    const idx = new Map();
    for (const l of logs) {
      const d = new Date(l.ts);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}__${l.punch_type}`;
      if (!idx.has(key)) idx.set(key, l.id);
    }
    return idx;
  }, [logs]);

  const [editBusyKey, setEditBusyKey] = useState(null);
  async function editPunch(dateKey, punchType, newValue, hadValue) {
    const busyKey = dateKey + punchType;
    setEditBusyKey(busyKey);
    if (!newValue) {
      if (hadValue) {
        const logId = punchIndex.get(`${dateKey}__${punchType}`);
        if (logId) await deleteAttendanceLog(logId);
      }
    } else {
      await applyTimeEdit({ employeeId: emp.id, dateKey, punchType, newTime: newValue });
    }
    await refreshLogs();
    setEditBusyKey(null);
  }

  const currentYear = new Date().getFullYear();
  const leaveUsed = useMemo(() => {
    const used = { sick: 0, personal: 0, vacation: 0 };
    for (const l of leaveLogs) {
      if (!l.leave_date?.startsWith(String(currentYear))) continue;
      used[l.leave_type] = (used[l.leave_type] || 0) + Number(l.days || 0);
    }
    return used;
  }, [leaveLogs, currentYear]);

  // ยื่นคำขอ → เข้าคิวอนุมัติ (แก้เวลา/OT/ลา/เปลี่ยนกะ มีโครงสร้าง → อนุมัติแล้วมีผลจริงอัตโนมัติ)
  const [reqType, setReqType] = useState(REQ_TYPES[0].id);
  const [reqDetail, setReqDetail] = useState("");
  const [reqDate, setReqDate] = useState("");
  const [reqLeaveType, setReqLeaveType] = useState(LEAVE_TYPES[0].v);
  const [reqDays, setReqDays] = useState(1);
  const [reqPunchType, setReqPunchType] = useState(PUNCH_TYPES[0].v);
  const [reqNewTime, setReqNewTime] = useState("");
  const [reqOtMinutes, setReqOtMinutes] = useState("");
  const [reqShiftId, setReqShiftId] = useState("");
  const [reqMsg, setReqMsg] = useState(null);
  const [reqBusy, setReqBusy] = useState(false);

  async function sendRequest(e) {
    e?.preventDefault();
    if (reqBusy) return;
    const note = reqDetail.trim();
    let detail = note, payload = null;

    if (reqType === "leave") {
      if (!reqDate) { setReqMsg({ ok: false, text: "เลือกวันที่จะลา" }); return; }
      const leaveLabel = LEAVE_TYPES.find((l) => l.v === reqLeaveType)?.l;
      detail = `${leaveLabel} ${reqDays} วัน เริ่ม ${reqDate}${note ? " · " + note : ""}`;
      payload = { leaveType: reqLeaveType, days: Number(reqDays) || 1, fromDate: reqDate };
    } else if (reqType === "time_edit") {
      if (!reqDate || !reqNewTime) { setReqMsg({ ok: false, text: "เลือกวันที่และเวลาที่ต้องการแก้" }); return; }
      const punchLabel = PUNCH_TYPES.find((p) => p.v === reqPunchType)?.l;
      detail = `ขอแก้เวลา${punchLabel} วันที่ ${reqDate} เป็น ${reqNewTime}${note ? " · " + note : ""}`;
      payload = { date: reqDate, punchType: reqPunchType, newTime: reqNewTime };
    } else if (reqType === "ot_edit") {
      if (!reqDate || !reqOtMinutes) { setReqMsg({ ok: false, text: "เลือกวันที่และจำนวนนาที OT" }); return; }
      detail = `ขอ OT วันที่ ${reqDate} จำนวน ${reqOtMinutes} นาที${note ? " · " + note : ""}`;
      payload = { date: reqDate, minutes: Number(reqOtMinutes) };
    } else if (reqType === "shift_change") {
      if (!reqShiftId) { setReqMsg({ ok: false, text: "เลือกกะที่ต้องการเปลี่ยนไป" }); return; }
      const shiftName = shifts.find((s) => s.id === reqShiftId)?.name;
      detail = `ขอเปลี่ยนเป็น${shiftName}${note ? " · " + note : ""}`;
      payload = { shiftId: reqShiftId };
    } else if (!note) {
      setReqMsg({ ok: false, text: "กรอกรายละเอียด" }); return;
    }

    setReqBusy(true); setReqMsg(null);
    const res = await createApproval({ requestType: reqType, employeeId: employee?.id, detail, payload });
    setReqBusy(false);
    if (res?.error) { setReqMsg({ ok: false, text: "ส่งไม่สำเร็จ: " + res.error }); return; }
    setReqMsg({ ok: true, text: `ส่งคำขอแล้ว — รอ${reqType === "time_edit" || reqType === "ot_edit" ? "ผู้บริหาร" : "หัวหน้า"}อนุมัติ` });
    setReqDetail(""); setReqDate(""); setReqNewTime(""); setReqOtMinutes(""); setReqDays(1); setReqShiftId("");
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
        {execView && <p className="mt-2 text-xs text-emerald-600">🔓 สิทธิ์ผู้บริหาร: แก้ไข/ลบเวลาการตอกบัตรได้โดยตรง (พิมพ์เวลาใหม่ หรือลบให้ว่างเพื่อลบรายการ)</p>}
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
                const cells = [
                  { punchType: "in", value: d.in },
                  { punchType: "lunch_out", value: d.lunchOut },
                  { punchType: "lunch_in", value: d.lunchIn },
                  { punchType: "out", value: d.out },
                ];
                return (
                  <tr key={i} className={`border-b border-slate-50 ${d.isOff ? "bg-slate-50/60" : d.absent ? "bg-rose-50/40" : ""}`}>
                    <td className="px-3 py-2 font-medium text-slate-700">{d.dateLabel}</td>
                    {cells.map((c) => {
                      const busyKey = d.dateKey + c.punchType;
                      if (!execView) {
                        return <td key={c.punchType} className="px-2 py-2 text-center tabular-nums text-slate-600">{c.value}</td>;
                      }
                      return (
                        <td key={c.punchType} className="px-1.5 py-1.5 text-center">
                          <input
                            type="time"
                            key={`${d.dateKey}-${c.punchType}-${c.value}`}
                            defaultValue={toInputTime(c.value)}
                            disabled={editBusyKey === busyKey}
                            onBlur={(e) => {
                              const nv = e.target.value;
                              const old = toInputTime(c.value);
                              if (nv !== old) editPunch(d.dateKey, c.punchType, nv, c.value !== "-");
                            }}
                            className="w-[92px] rounded-md border border-slate-200 bg-white px-1 py-1 text-center text-xs tabular-nums outline-none focus:border-emerald-500 disabled:opacity-50"
                          />
                        </td>
                      );
                    })}
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

      <Card className="mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">หักมาสาย (เกินผ่อนผัน {RULES.lateGraceMinutesPerMonth} น. → {t.lateChargeable} น. × {RULES.lateRatePerMinute})</span>
          <span className="font-semibold text-rose-600">- {baht(t.lateDeduct)}</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          * OT ปัดเป็นชั่วโมงเต็ม (เศษ ≥ {RULES.otRoundUpAtMinutes} น. ปัดขึ้น 1 ชม.) — ยอดนี้ส่งเข้าสลิปอัตโนมัติ
          {manualOtMin > 0 && ` · รวม OT ที่ผู้บริหารอนุมัติพิเศษ ${manualOtMin} นาที`}
        </p>
      </Card>

      {/* สรุปวันลา */}
      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">สรุปวันลา (ปี {currentYear})</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          {LEAVE_TYPES.map((lt) => {
            const quota = emp?.[`leave_${lt.v}_quota`] ?? 0;
            const used = leaveUsed[lt.v] || 0;
            const remain = quota - used;
            return (
              <div key={lt.v} className="rounded-xl bg-slate-50 py-2">
                <div className="text-xs text-slate-400">{lt.l}</div>
                <div className={`text-lg font-bold tabular-nums ${remain <= 0 ? "text-rose-600" : "text-slate-800"}`}>{remain}</div>
                <div className="text-[11px] text-slate-400">จาก {quota} · ใช้ {used}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ยื่นคำขอ (ลา/เปลี่ยนกะ/แก้เวลา/แก้ OT) → เข้าคิวให้อนุมัติ, อนุมัติแล้วมีผลจริงทันที */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">ยื่นคำขอถึงหัวหน้า</h2>
        <form onSubmit={sendRequest} className="space-y-3">
          <Field label="ประเภทคำขอ">
            <Select value={reqType} onChange={(e) => setReqType(e.target.value)}>
              {REQ_TYPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </Field>

          {reqType === "leave" && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="ประเภทการลา">
                <Select value={reqLeaveType} onChange={(e) => setReqLeaveType(e.target.value)}>
                  {LEAVE_TYPES.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
                </Select>
              </Field>
              <Field label="วันที่เริ่มลา"><input type="date" className={inputCls} value={reqDate} onChange={(e) => setReqDate(e.target.value)} /></Field>
              <Field label="จำนวนวัน"><input type="number" min="0.5" step="0.5" className={inputCls} value={reqDays} onChange={(e) => setReqDays(e.target.value)} /></Field>
            </div>
          )}

          {reqType === "shift_change" && (
            <Field label="กะที่ต้องการเปลี่ยนไป">
              <Select value={reqShiftId} onChange={(e) => setReqShiftId(e.target.value)}>
                <option value="">— เลือกกะ —</option>
                {shifts.filter((s) => s.id !== emp?.shift_id).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>
                ))}
              </Select>
            </Field>
          )}

          {reqType === "time_edit" && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="วันที่"><input type="date" className={inputCls} value={reqDate} onChange={(e) => setReqDate(e.target.value)} /></Field>
              <Field label="ช่วงเวลา">
                <Select value={reqPunchType} onChange={(e) => setReqPunchType(e.target.value)}>
                  {PUNCH_TYPES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                </Select>
              </Field>
              <Field label="เวลาที่ถูกต้อง"><input type="time" className={inputCls} value={reqNewTime} onChange={(e) => setReqNewTime(e.target.value)} /></Field>
            </div>
          )}

          {reqType === "ot_edit" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="วันที่"><input type="date" className={inputCls} value={reqDate} onChange={(e) => setReqDate(e.target.value)} /></Field>
              <Field label="จำนวน OT (นาที)"><input type="number" min="1" className={inputCls} value={reqOtMinutes} onChange={(e) => setReqOtMinutes(e.target.value)} /></Field>
            </div>
          )}

          <Field label="หมายเหตุ (ถ้ามี)">
            <input value={reqDetail} onChange={(e) => setReqDetail(e.target.value)} className={inputCls} placeholder="เช่น เหตุผลเพิ่มเติม" />
          </Field>

          {reqMsg && <p className={`text-sm ${reqMsg.ok ? "text-emerald-600" : "text-rose-500"}`}>{reqMsg.text}</p>}
          <button type="submit" disabled={reqBusy} className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white ${reqBusy ? "bg-slate-300" : "bg-sky-600 active:bg-sky-700"}`}>
            {reqBusy ? "กำลังส่ง…" : "ส่งคำขอ"}
          </button>
          <p className="text-xs text-slate-400">“แก้เวลาทำงาน/แก้ OT” หัวหน้าอนุมัติไม่ได้ ต้องผู้บริหาร (ตามกติกา) — อนุมัติแล้วระบบแก้เวลา/เปลี่ยนกะ/เพิ่ม OT/หักวันลาให้อัตโนมัติ</p>
        </form>
      </Card>
    </Page>
  );
}
