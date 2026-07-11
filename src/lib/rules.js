// ============================================================
// กติกาธุรกิจ (แก้ที่เดียว) — ตามที่เจ้านายกำหนด
// ============================================================
export const RULES = {
  otRoundUpAtMinutes: 45,       // OT: เศษ ≥ 45 นาที ปัดขึ้น 1 ชม. / ต่ำกว่าปัดทิ้ง  (req 1)
  otRatePerHour: 25,            // OT บาท/ชม.
  lunchFreeMinutes: 60,         // หลังร้าน: พักเที่ยง ≤ 60 นาที ไม่หักเงิน           (req 5)
  lateGraceMinutesPerMonth: 10, // ผ่อนผันสายสะสมทั้งงวด (นาที)
  lateRatePerMinute: 5,         // ส่วนเกินผ่อนผัน หักนาทีละ (บาท)
  ssoRate: 0.05,
  ssoCapBase: 15000,
  workDaysPerMonth: 26,
};

// ---------- OT: ปัดเป็นชั่วโมงเต็ม (req 1) ----------
// เศษ ≥ otRoundUpAtMinutes (45น.) ปัดขึ้น 1 ชม., ต่ำกว่าปัดทิ้ง
export function roundOtMinutes(min) {
  if (min <= 0) return 0;
  const hours = Math.floor(min / 60);
  const rem = min % 60;
  return (hours + (rem >= RULES.otRoundUpAtMinutes ? 1 : 0)) * 60;
}
export const otHours = (min) => roundOtMinutes(min) / 60;

export const toMin = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// ---------- แผนก ----------
export const isBackOffice = (emp) => emp?.department === "back";  // หลังร้าน/หลังบ้าน

// หลังร้าน: กะถูกล็อก + เที่ยงยืดหยุ่น + ไม่จับ GPS ตอนพักเที่ยง (req 2, req 5)
export const shiftLocked = (emp) => isBackOffice(emp);

// พักเที่ยงเกินเวลาที่กำหนดไหม → เกินถึงจะหัก (req 5)
export function lunchOverMinutes(lunchOutTs, lunchInTs) {
  if (!lunchOutTs || !lunchInTs) return 0;
  const mins = Math.round((new Date(lunchInTs) - new Date(lunchOutTs)) / 60000);
  return Math.max(0, mins - RULES.lunchFreeMinutes);
}

// ---------- สิทธิ์ (req 3, 6) ----------
export const ROLE_LABEL = { exec: "ผู้บริหาร", head: "หัวหน้า", employee: "พนักงาน" };
export const isHead = (r) => r === "head";
export const isExec = (r) => r === "exec";
export const isManager = (r) => r === "head" || r === "exec"; // หัวหน้าหรือผู้บริหาร

// หัวหน้าอนุมัติได้ทุกอย่าง "ยกเว้น" แก้เวลาทำงาน/OT (พวกนั้นต้องผู้บริหาร) — req 3
const HEAD_FORBIDDEN = new Set(["time_edit", "ot_edit"]);
export function canApprove(role, requestType) {
  if (isExec(role)) return true;                 // ผู้บริหารอนุมัติได้หมด
  if (isHead(role)) return !HEAD_FORBIDDEN.has(requestType);
  return false;
}
// กำหนด/เปลี่ยนกะ ทำได้เฉพาะหัวหน้ากับผู้บริหาร (req 6)
export const canSetShift = (role) => isManager(role);
// อนุมัติ "เปลี่ยนกะ" ให้เฉพาะหัวหน้า (req 6)
export const canApproveShiftChange = (role) => isHead(role) || isExec(role);
// จัดการพนักงาน/กำหนดสิทธิ = เฉพาะผู้บริหาร
export const canManageStaff = (role) => isExec(role);
