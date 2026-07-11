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

// ---------- รวมการตอกบัตร (attendance_logs) → รายวัน ----------
// logs: [{punch_type, ts}]  shift: {start_time,end_time,lunch_minutes}
export function dailyFromPunches(logs, shift) {
  const start = toMin(shift?.start_time || "08:00");
  const end = toMin(shift?.end_time || "17:00");
  const stdLunch = shift?.lunch_minutes ?? 60;

  const byDay = {};
  for (const l of logs || []) {
    const d = new Date(l.ts);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    (byDay[key] ||= { date: d, punches: {} }).punches[l.punch_type] = d;
  }

  return Object.values(byDay)
    .sort((a, b) => a.date - b.date)
    .map(({ date, punches }) => {
      const ci = punches.in ? minOfDay(punches.in) : null;
      const lo = punches.lunch_out ? minOfDay(punches.lunch_out) : null;
      const li = punches.lunch_in ? minOfDay(punches.lunch_in) : null;
      const co = punches.out ? minOfDay(punches.out) : null;
      const present = ci != null;

      let workedMin = 0;
      if (ci != null && co != null) {
        if (lo != null && li != null) workedMin = Math.max(0, lo - ci) + Math.max(0, co - li);
        else workedMin = Math.max(0, co - ci - stdLunch);
      }
      const lateMin = ci != null ? Math.max(0, ci - start) : 0;
      const otMin = co != null ? roundOtMinutes(Math.max(0, co - end)) : 0;
      const lunchMin = lo != null && li != null ? li - lo : null;
      const lunchOver = lunchMin != null ? Math.max(0, lunchMin - RULES.lunchFreeMinutes) : 0;

      return {
        dateLabel: fmtDay(date),
        in: fmtHM(ci), lunchOut: fmtHM(lo), lunchIn: fmtHM(li), out: fmtHM(co),
        present, workedMin, lateMin, otMin, lunchOver,
      };
    });
}

export function summarizeDays(days) {
  const lateTotal = days.reduce((s, d) => s + d.lateMin, 0);
  const otTotalMin = days.reduce((s, d) => s + d.otMin, 0);
  const workedTotalMin = days.reduce((s, d) => s + d.workedMin, 0);
  const presentDays = days.filter((d) => d.present).length;
  const lateChargeable = Math.max(0, lateTotal - RULES.lateGraceMinutesPerMonth);
  const lateDeduct = lateChargeable * RULES.lateRatePerMinute;
  const otHours = otTotalMin / 60;
  const otPay = otHours * RULES.otRatePerHour;
  return { lateTotal, otTotalMin, workedTotalMin, presentDays, lateChargeable, lateDeduct, otHours, otPay };
}

// ---------- คำนวณสลิปเงินเดือน ----------
// emp: {pay_type, base_salary}  att: {presentDays, lateTotal, otHours}  deducts: [{type, amount}]
export function computePayslip(emp, att, deducts) {
  const dailyWage = emp.pay_type === "daily" ? emp.base_salary : emp.base_salary / RULES.workDaysPerMonth;
  const base = emp.pay_type === "daily" ? emp.base_salary * (att.presentDays || 0) : emp.base_salary;

  const otPay = (att.otHours || 0) * RULES.otRatePerHour;
  const grossEarnings = base + otPay;

  const lateChargeable = Math.max(0, (att.lateTotal || 0) - RULES.lateGraceMinutesPerMonth);
  const dLate = lateChargeable * RULES.lateRatePerMinute;
  const sso = Math.min(base, RULES.ssoCapBase) * RULES.ssoRate;
  const dExtra = (deducts || []).reduce((s, d) => s + Number(d.amount || 0), 0);

  const totalDeductions = dLate + sso + dExtra;
  const netPay = grossEarnings - totalDeductions;

  return {
    dailyWage, base, otPay, grossEarnings,
    lateInfo: { total: att.lateTotal || 0, grace: RULES.lateGraceMinutesPerMonth, chargeable: lateChargeable },
    dLate, sso, dExtra, deducts: deducts || [], totalDeductions, netPay,
  };
}

// ---------- format ----------
export function fmtHM(mins) {
  if (mins == null || mins < 0) return "-";
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
export const round2 = (n) => Math.round(n * 100) / 100;
export const baht = (n) => round2(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
