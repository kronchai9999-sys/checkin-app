import { RULES, roundOtMinutes, toMin } from "./rules.js";

// ---------- งวด (period) ----------
export const PERIODS = [
  { label: "กรกฎาคม 2026", year: 2026, month: 7 },
  { label: "สิงหาคม 2026", year: 2026, month: 8 },
  { label: "กันยายน 2026", year: 2026, month: 9 },
];

export function monthRange({ year, month }) {
  const from = new Date(year, month - 1, 1, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59);   // วันสุดท้ายของเดือน
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

const fmtDay = (d) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const minOfDay = (d) => d.getHours() * 60 + d.getMinutes();

// ---------- ปฏิทินรายวันของงวด (รวมวันหยุดประจำสัปดาห์ + ตรวจขาดงาน) ----------
// logs: attendance_logs  shift: {start_time,end_time,lunch_minutes}
// offDays: [0..6] (0=อาทิตย์) — วันที่ isOff จะไม่นับสาย/ขาด
// ตัดที่ "วันนี้" ถ้าเป็นเดือนปัจจุบัน (ไม่นับวันในอนาคตเป็นขาดงาน)
export function buildCalendar(logs, shift, offDays, period) {
  const { year, month } = period;
  const lastDay = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const cutoff = isCurrentMonth ? today.getDate() : lastDay;

  const start = toMin(shift?.start_time || "08:00");
  const end = toMin(shift?.end_time || "17:00");
  const stdLunch = shift?.lunch_minutes ?? 60;
  const off = new Set(offDays || []);

  const punchesByDay = {};
  for (const l of logs || []) {
    const d = new Date(l.ts);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
    (punchesByDay[d.getDate()] ||= {})[l.punch_type] = d;
  }

  const days = [];
  for (let dnum = 1; dnum <= cutoff; dnum++) {
    const date = new Date(year, month - 1, dnum);
    const dow = date.getDay();
    const isOff = off.has(dow);
    const p = punchesByDay[dnum] || {};
    const ci = p.in ? minOfDay(p.in) : null;
    const co = p.out ? minOfDay(p.out) : null;
    const lo = p.lunch_out ? minOfDay(p.lunch_out) : null;
    const li = p.lunch_in ? minOfDay(p.lunch_in) : null;
    const present = ci != null;

    let workedMin = 0;
    if (ci != null && co != null) {
      if (lo != null && li != null) workedMin = Math.max(0, lo - ci) + Math.max(0, co - li);
      else workedMin = Math.max(0, co - ci - stdLunch);
    }
    const lateMin = present ? Math.max(0, ci - start) : 0;
    const otMin = co != null ? roundOtMinutes(Math.max(0, co - end)) : 0;
    const absent = !isOff && !present;

    days.push({
      dateKey: `${year}-${String(month).padStart(2, "0")}-${String(dnum).padStart(2, "0")}`,
      dateLabel: fmtDay(date), dow, isOff,
      in: fmtHM(ci), lunchOut: fmtHM(lo), lunchIn: fmtHM(li), out: fmtHM(co),
      present, workedMin, lateMin, otMin, absent,
    });
  }
  return days;
}

// สรุปยอดสำหรับคิดเงินเดือน — waivers: Map<dateKey, 'late'|'absent'|'both'> (ยกเว้นไม่หัก)
export function summarizePayroll(days, waivers) {
  let lateTotal = 0, absentDays = 0, otTotalMin = 0, workedTotalMin = 0, presentDays = 0;
  for (const d of days) {
    if (d.present) { presentDays++; workedTotalMin += d.workedMin; otTotalMin += d.otMin; }
    const w = waivers?.get(d.dateKey);
    if (d.lateMin > 0 && w !== "late" && w !== "both") lateTotal += d.lateMin;
    if (d.absent && w !== "absent" && w !== "both") absentDays++;
  }
  const lateChargeable = Math.max(0, lateTotal - RULES.lateGraceMinutesPerMonth);
  const lateDeduct = lateChargeable * RULES.lateRatePerMinute;
  const otHours = otTotalMin / 60;
  const otPay = otHours * RULES.otRatePerHour;
  return { lateTotal, absentDays, otTotalMin, workedTotalMin, presentDays, lateChargeable, lateDeduct, otHours, otPay };
}

// ---------- คำนวณสลิปเงินเดือน ----------
// emp: {pay_type, base_salary, sso}  att: {presentDays, lateTotal, otHours, absentDays}
// deducts: [{type, amount}]  carryIn: ยอดหนี้ยกมาจากงวดก่อน (บาท)
export function computePayslip(emp, att, deducts, carryIn = 0) {
  const dailyWage = emp.pay_type === "daily" ? emp.base_salary : emp.base_salary / RULES.workDaysPerMonth;
  const base = emp.pay_type === "daily" ? emp.base_salary * (att.presentDays || 0) : emp.base_salary;

  const otPay = (att.otHours || 0) * RULES.otRatePerHour;
  const grossEarnings = base + otPay;

  const lateChargeable = Math.max(0, (att.lateTotal || 0) - RULES.lateGraceMinutesPerMonth);
  const dLate = lateChargeable * RULES.lateRatePerMinute;
  // หักขาดงาน (เฉพาะรายเดือน — รายวันไม่จ่ายวันขาดอยู่แล้วเพราะฐานคิดจากวันมาทำงาน)
  const dAbsent = emp.pay_type !== "daily" ? dailyWage * (att.absentDays || 0) : 0;
  const ssoApplied = emp.sso !== false;                                   // สปส. เลือกหักรายคน
  const sso = ssoApplied ? Math.min(base, RULES.ssoCapBase) * RULES.ssoRate : 0;
  const dExtra = (deducts || []).reduce((s, d) => s + Number(d.amount || 0), 0);

  const beforeCarry = grossEarnings - dLate - dAbsent - sso - dExtra;
  const rawNet = beforeCarry - carryIn;                                   // หักหนี้ยกมา
  const netPay = Math.max(0, rawNet);                                     // จ่ายจริงไม่ต่ำกว่า 0
  const carryForward = rawNet < 0 ? -rawNet : 0;                          // ติดลบ → ยกไปงวดหน้า
  const totalDeductions = dLate + dAbsent + sso + dExtra + carryIn;

  return {
    dailyWage, base, otPay, grossEarnings,
    lateInfo: { total: att.lateTotal || 0, grace: RULES.lateGraceMinutesPerMonth, chargeable: lateChargeable },
    dLate, dAbsent, absentDays: att.absentDays || 0, sso, ssoApplied, dExtra, deducts: deducts || [],
    carryIn, carryForward, totalDeductions, netPay,
  };
}

// งวดถัดไป (สำหรับบันทึกยอดยกมา)
export function nextPeriodLabel(label) {
  const i = PERIODS.findIndex((p) => p.label === label);
  return i >= 0 && i + 1 < PERIODS.length ? PERIODS[i + 1].label : null;
}

// ---------- format ----------
export function fmtHM(mins) {
  if (mins == null || mins < 0) return "-";
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
export const round2 = (n) => Math.round(n * 100) / 100;
export const baht = (n) => round2(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
