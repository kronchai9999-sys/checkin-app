// ข้อมูลตัวอย่างสำหรับ "โหมดเดโม" (เมื่อยังไม่ต่อ Supabase)
export const DEMO_ORG = {
  companies: [{ id: "bakery", name: "ร้านเบเกอรี่บรรจุภัณฑ์ กาฬสินธุ์" }],
  branches: [{ id: "b1", company_id: "bakery", name: "สาขากาฬสินธุ์", lat: 16.4322, lng: 103.506, radius: 150 }],
  shifts: [
    { id: "morning", company_id: "bakery", name: "กะเช้า", start_time: "08:00", end_time: "17:00", lunch_minutes: 60 },
    { id: "afternoon", company_id: "bakery", name: "กะบ่าย", start_time: "13:00", end_time: "22:00", lunch_minutes: 60 },
  ],
};

export const DEMO_EMPLOYEES = [
  { id: "demo-exec", code: "EMP-000", name: "ผู้บริหาร", role: "exec", department: "front", company_id: "bakery", branch_id: "b1", shift_id: "morning", position: "ผู้บริหาร", pay_type: "monthly", base_salary: 30000 },
  { id: "demo-head", code: "EMP-001", name: "หัวหน้าสาขา", role: "head", department: "front", company_id: "bakery", branch_id: "b1", shift_id: "morning", position: "หัวหน้าสาขา", pay_type: "monthly", base_salary: 18000 },
  { id: "demo-emp1", code: "EMP-002", name: "สมหญิง ใจดี", role: "employee", department: "front", company_id: "bakery", branch_id: "b1", shift_id: "morning", position: "พนักงานขาย", pay_type: "monthly", base_salary: 13000 },
  { id: "demo-emp2", code: "EMP-003", name: "ประยุทธ์ ขยันงาน", role: "employee", department: "back", company_id: "bakery", branch_id: "b1", shift_id: "morning", position: "พนักงานครัว", pay_type: "monthly", base_salary: 12000 },
];

// สร้างการตอกบัตรตัวอย่างของพนักงานคนหนึ่งใน 1 งวด (attendance_logs-like)
export function demoPunches(emp, period) {
  const back = emp?.department === "back";
  const days = [
    { d: 1, in: "07:58", lo: "12:01", li: "13:00", out: "17:05" },
    { d: 2, in: "08:12", lo: "12:00", li: "13:10", out: "18:30" }, // สาย + OT
    { d: 3, in: "08:00", lo: "12:03", li: "12:58", out: "17:00" },
    { d: 4, in: "08:20", lo: "12:00", li: "13:25", out: "20:15" }, // สาย + พักเกิน + OT
    { d: 5, in: "07:55", lo: "12:00", li: "13:00", out: "17:02" },
  ];
  const mk = (day, hm, type) => {
    const [h, m] = hm.split(":").map(Number);
    return { punch_type: type, ts: new Date(period.year, period.month - 1, day, h, m).toISOString() };
  };
  const out = [];
  for (const r of days) {
    out.push(mk(r.d, r.in, "in"));
    if (back) { out.push(mk(r.d, r.lo, "lunch_out")); out.push(mk(r.d, r.li, "lunch_in")); }
    out.push(mk(r.d, r.out, "out"));
  }
  return out;
}

export function demoDeductions(empId, period) {
  if (empId === "demo-emp2") return [{ type: "ทำของเสียหาย", amount: 300, note: "จานแตก 2 ใบ", created_by_name: "หัวหน้าสาขา" }];
  return [];
}

export const DEMO_APPROVALS = [
  { id: "d1", request_type: "shift_change", employee_id: "demo-emp1", detail: "ขอเปลี่ยนกะเช้า → กะบ่าย (พรุ่งนี้)", status: "pending", created_at: new Date().toISOString() },
  { id: "d2", request_type: "leave", employee_id: "demo-emp2", detail: "ลากิจ 1 วัน", status: "pending", created_at: new Date().toISOString() },
  { id: "d3", request_type: "time_edit", employee_id: "demo-emp1", detail: "ขอแก้เวลาเข้า 08:15 → 08:00", status: "pending", created_at: new Date().toISOString() },
];
