import { useState, useMemo } from "react";

/**
 * Timesheet — ตรวจ/แก้ไขเวลาทำงานก่อนปิดงวดคิดเงินเดือน
 * ------------------------------------------------------------------
 * - แสดงเวลาตอกบัตร 4 ช่อง/วัน (เข้า, พักออก, พักเข้า, เลิก) แก้ไขได้
 * - คำนวณอัตโนมัติ: ชั่วโมงทำงาน, สาย, OT (ชม.ละ 25)
 * - สรุปทั้งงวด: สายสะสม + หักสาย (ผ่อนผัน 10 น., เกินหักนาทีละ 5),
 *   OT รวม + เงิน OT  -> ส่งต่อเข้าระบบคิดเงินเดือน
 * - ปุ่ม "ปิดงวด" ล็อกค่าเพื่อส่งเข้า payroll
 *
 * ระบบจริง: โหลดจาก attendance_logs, การแก้ไขบันทึก audit (ใคร/เมื่อไหร่/แก้อะไร)
 */

const RULES = {
  otRatePerHour: 25,            // OT บาท/ชม.
  lateGraceMinutesPerMonth: 10, // ผ่อนผันสายสะสมทั้งงวด (นาที)
  lateRatePerMinute: 5,         // ส่วนเกินผ่อนผัน หักนาทีละ (บาท)
  otRoundUpAtMinutes: 45,       // OT ปัดเป็นชั่วโมงเต็ม: เศษ ≥ ค่านี้ ปัดขึ้น 1 ชม. / ต่ำกว่าปัดทิ้ง
};

// ปัด OT เป็นชั่วโมงเต็ม — เศษ ≥ otRoundUpAtMinutes (เช่น 45 น.) ปัดขึ้น 1 ชม., ต่ำกว่าปัดทิ้ง
function roundOtMinutes(min) {
  if (min <= 0) return 0;
  const hours = Math.floor(min / 60);
  const rem = min % 60;
  const extra = rem >= RULES.otRoundUpAtMinutes ? 1 : 0;
  return (hours + extra) * 60;
}

const SHIFT = { name: "กะเช้า", start: "08:00", end: "17:00" };

// ข้อมูลตัวอย่าง (ระบบจริงดึงจาก attendance_logs)
const SAMPLE = {
  emp001: {
    name: "สมหญิง ใจดี", code: "EMP-001",
    days: [
      { date: "1 มิ.ย.", in: "07:58", lunchOut: "12:01", lunchIn: "13:02", out: "17:05" },
      { date: "2 มิ.ย.", in: "08:06", lunchOut: "12:00", lunchIn: "13:00", out: "18:30" },
      { date: "3 มิ.ย.", in: "08:00", lunchOut: "12:03", lunchIn: "12:58", out: "17:00" },
      { date: "4 มิ.ย.", in: "08:12", lunchOut: "12:00", lunchIn: "13:05", out: "20:15" },
      { date: "5 มิ.ย.", in: "", lunchOut: "", lunchIn: "", out: "" }, // ขาด
    ],
  },
  emp002: {
    name: "ประยุทธ์ ขยันงาน", code: "EMP-014",
    days: [
      { date: "1 มิ.ย.", in: "08:25", lunchOut: "12:00", lunchIn: "13:00", out: "17:00" },
      { date: "2 มิ.ย.", in: "08:40", lunchOut: "12:10", lunchIn: "13:15", out: "17:00" },
      { date: "3 มิ.ย.", in: "08:30", lunchOut: "12:00", lunchIn: "13:00", out: "19:45" },
      { date: "4 มิ.ย.", in: "08:00", lunchOut: "12:00", lunchIn: "13:00", out: "17:00" },
    ],
  },
};

const toMin = (s) => {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
const fmtHM = (mins) => {
  if (mins == null || mins < 0) return "-";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
};
const round2 = (n) => Math.round(n * 100) / 100;
const baht = (n) => round2(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// คำนวณรายวัน
function dayCalc(d) {
  const ci = toMin(d.in), lo = toMin(d.lunchOut), li = toMin(d.lunchIn), co = toMin(d.out);
  const present = ci != null;
  // ชั่วโมงทำงาน = ช่วงเช้า + ช่วงบ่าย (หักพักเที่ยง)
  let workedMin = 0;
  if (ci != null && lo != null) workedMin += Math.max(0, lo - ci);
  if (li != null && co != null) workedMin += Math.max(0, co - li);
  // สาย = เข้างานช้ากว่าเวลากะ
  const lateMin = ci != null ? Math.max(0, ci - toMin(SHIFT.start)) : 0;
  // OT = เลิกงานหลังเวลากะ
  let otMin = co != null ? Math.max(0, co - toMin(SHIFT.end)) : 0;
  otMin = roundOtMinutes(otMin);
  return { present, workedMin, lateMin, otMin };
}

const TH = { fontFamily: '"Sarabun","Noto Sans Thai","Prompt",sans-serif' };

export default function Timesheet() {
  const [empId, setEmpId] = useState("emp002");
  const [data, setData] = useState(() => JSON.parse(JSON.stringify(SAMPLE)));
  const [locked, setLocked] = useState(false);

  const emp = data[empId];
  const original = SAMPLE[empId];

  const calc = useMemo(() => emp.days.map(dayCalc), [emp]);

  const totals = useMemo(() => {
    const lateTotal = calc.reduce((s, d) => s + d.lateMin, 0);
    const otTotalMin = calc.reduce((s, d) => s + d.otMin, 0);
    const workedTotalMin = calc.reduce((s, d) => s + d.workedMin, 0);
    const presentDays = calc.filter((d) => d.present).length;
    const lateChargeable = Math.max(0, lateTotal - RULES.lateGraceMinutesPerMonth);
    const lateDeduct = lateChargeable * RULES.lateRatePerMinute;
    const otHours = otTotalMin / 60;
    const otPay = otHours * RULES.otRatePerHour;
    return { lateTotal, otTotalMin, workedTotalMin, presentDays, lateChargeable, lateDeduct, otHours, otPay };
  }, [calc]);

  function edit(dayIdx, field, value) {
    if (locked) return;
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next[empId].days[dayIdx][field] = value;
      return next;
    });
  }
  function resetEmp() {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next[empId] = JSON.parse(JSON.stringify(SAMPLE[empId]));
      return next;
    });
    setLocked(false);
  }
  const isEdited = (dayIdx, field) => emp.days[dayIdx][field] !== original.days[dayIdx][field];

  const FIELDS = [
    { key: "in", label: "เข้า" },
    { key: "lunchOut", label: "พักออก" },
    { key: "lunchIn", label: "พักเข้า" },
    { key: "out", label: "เลิก" },
  ];

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6" style={TH}>
      <div className="mx-auto max-w-4xl space-y-4">
        {/* หัว */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-900">ตรวจเวลาทำงานก่อนคิดเงินเดือน</h1>
              <p className="text-sm text-slate-500">งวด มิถุนายน 2569 · {SHIFT.name} {SHIFT.start}–{SHIFT.end} น.</p>
            </div>
            <select value={empId} onChange={(e) => setEmpId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              {Object.entries(data).map(([id, e]) => <option key={id} value={id}>{e.name} ({e.code})</option>)}
            </select>
          </div>
          {locked && (
            <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              🔒 ปิดงวดแล้ว — ค่าเหล่านี้ถูกส่งเข้าระบบคิดเงินเดือน (กดปลดล็อกเพื่อแก้ไขใหม่)
            </div>
          )}
        </div>

        {/* ตารางเวลา */}
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <th className="px-3 py-2 text-left">วันที่</th>
                {FIELDS.map((f) => <th key={f.key} className="px-2 py-2">{f.label}</th>)}
                <th className="px-2 py-2">ชม.ทำงาน</th>
                <th className="px-2 py-2">สาย</th>
                <th className="px-2 py-2">OT</th>
              </tr>
            </thead>
            <tbody>
              {emp.days.map((d, i) => {
                const cc = calc[i];
                return (
                  <tr key={i} className={`border-b border-slate-100 ${!cc.present ? "bg-rose-50/40" : ""}`}>
                    <td className="px-3 py-2 font-medium text-slate-700">{d.date}</td>
                    {FIELDS.map((f) => (
                      <td key={f.key} className="px-1 py-1.5 text-center">
                        <input
                          type="time"
                          value={d[f.key]}
                          disabled={locked}
                          onChange={(e) => edit(i, f.key, e.target.value)}
                          className={`w-[92px] rounded-md border px-1.5 py-1 text-center text-sm tabular-nums ${isEdited(i, f.key) ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200"} ${locked ? "bg-slate-100 text-slate-400" : ""}`}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center tabular-nums text-slate-700">{cc.present ? fmtHM(cc.workedMin) : "ขาด"}</td>
                    <td className={`px-2 py-2 text-center tabular-nums ${cc.lateMin > 0 ? "font-semibold text-rose-600" : "text-slate-400"}`}>{cc.lateMin > 0 ? `${cc.lateMin}′` : "-"}</td>
                    <td className={`px-2 py-2 text-center tabular-nums ${cc.otMin > 0 ? "font-semibold text-amber-600" : "text-slate-400"}`}>{cc.otMin > 0 ? fmtHM(cc.otMin) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-1 text-xs text-slate-400">ช่องสีเหลือง = ถูกแก้ไขจากค่าที่ตอกจริง · OT ปัดเป็นชั่วโมงเต็ม (เศษตั้งแต่ {RULES.otRoundUpAtMinutes} นาที ปัดขึ้น 1 ชม., ต่ำกว่าปัดทิ้ง)</p>

        {/* สรุปงวด */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary label="วันมาทำงาน" value={`${totals.presentDays} วัน`} />
          <Summary label="ชั่วโมงทำงานรวม" value={fmtHM(totals.workedTotalMin) + " ชม."} />
          <Summary label="สายสะสม" value={`${totals.lateTotal} นาที`} tone={totals.lateTotal > RULES.lateGraceMinutesPerMonth ? "rose" : "ok"} />
          <Summary label="OT รวม" value={round2(totals.otHours) + " ชม."} tone="amber" />
        </div>

        {/* ยอดส่งเข้าเงินเดือน */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">ยอดที่จะส่งเข้าระบบคิดเงินเดือน</h2>
          <div className="space-y-2 text-sm">
            <Line label={`หักมาสาย (สายรวม ${totals.lateTotal} น. − ผ่อนผัน ${RULES.lateGraceMinutesPerMonth} = ${totals.lateChargeable} น. × ${RULES.lateRatePerMinute})`} value={`- ${baht(totals.lateDeduct)}`} tone="rose" />
            <Line label={`เงิน OT (${round2(totals.otHours)} ชม. × ${RULES.otRatePerHour})`} value={`+ ${baht(totals.otPay)}`} tone="amber" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {locked ? (
              <button onClick={() => setLocked(false)} className="rounded-xl bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">ปลดล็อกเพื่อแก้ไข</button>
            ) : (
              <button onClick={() => setLocked(true)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm">🔒 ปิดงวด → ส่งเข้าคิดเงินเดือน</button>
            )}
            <button onClick={resetEmp} className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-500 ring-1 ring-slate-200">คืนค่าที่ตอกจริง</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value, tone }) {
  const c = tone === "rose" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : "text-slate-800";
  return (
    <div className="rounded-xl bg-white p-3 text-center shadow-sm">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}

function Line({ label, value, tone }) {
  const c = tone === "rose" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : "text-slate-800";
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold tabular-nums ${c}`}>{value}</span>
    </div>
  );
}
