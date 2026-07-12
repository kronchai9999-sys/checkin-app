import { supabase, isSupabaseReady } from "./supabase.js";

/**
 * Data layer — ปลอดภัยเมื่อยังไม่ต่อ Supabase (คืน undefined/null/[] แล้วให้ UI ใช้เดโม)
 */

// ---------- ล็อกอิน user + password (req 7) ----------
export async function loginByCredentials(username, password) {
  if (!isSupabaseReady) return undefined;         // โหมดเดโม
  const { data, error } = await supabase.rpc("login_by_credentials", {
    p_username: username,
    p_password: password,
  });
  if (error) { console.error("login error:", error.message); return undefined; }
  return (data && data[0]) || null;               // null = user/pass ผิด
}

// ---------- โครงสร้างองค์กร ----------
export async function fetchOrg() {
  if (!isSupabaseReady) return null;
  const [{ data: companies }, { data: branches }, { data: shifts }] = await Promise.all([
    supabase.from("companies").select("*").order("name"),
    supabase.from("branches").select("*"),
    supabase.from("shifts").select("*"),
  ]);
  if (!companies) return null;
  return { companies, branches: branches || [], shifts: shifts || [] };
}

// รูปแบบซ้อน (companies → branches/shifts) สำหรับหน้าเช็คอิน
export async function fetchCompanies() {
  const org = await fetchOrg();
  if (!org) return null;
  return org.companies.map((c) => ({
    id: c.id,
    name: c.name,
    branches: org.branches.filter((b) => b.company_id === c.id)
      .map((b) => ({ id: b.id, name: b.name, lat: b.lat, lng: b.lng, radius: b.radius })),
    shifts: org.shifts.filter((s) => s.company_id === c.id)
      .map((s) => ({ id: s.id, name: s.name, start: s.start_time, end: s.end_time })),
  }));
}

export async function listEmployees() {
  if (!isSupabaseReady) return null;
  const { data, error } = await supabase.rpc("list_employees");
  if (error) { console.error("listEmployees:", error.message); return null; }
  return data;
}

// ---------- การตอกบัตร ----------
export async function savePunch({ employeeId, punchType, lat, lng, distance, branchId, ts }) {
  if (!isSupabaseReady) return { demo: true };
  const row = { employee_id: employeeId, punch_type: punchType, lat, lng, distance, branch_id: branchId };
  if (ts) row.ts = ts;   // เวลาตอกจริง (สำหรับรายการออฟไลน์ที่ส่งภายหลัง)
  const { error } = await supabase.from("attendance_logs").insert(row);
  if (error) { console.error("savePunch:", error.message); return { error: error.message }; }
  return { ok: true };
}

// ลบรายการตอกบัตร (attendance_logs มี RLS write ครบ → ลบตรงได้เลย) — ผู้บริหารใช้แก้ข้อมูลผิดพลาด
export async function deleteAttendanceLog(id) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("attendance_logs").delete().eq("id", id);
  if (error) { console.error("deleteAttendanceLog:", error.message); return { error: error.message }; }
  return { ok: true };
}

export async function fetchTodayPunches(employeeId) {
  if (!isSupabaseReady) return null;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("attendance_logs").select("*")
    .eq("employee_id", employeeId).gte("ts", start.toISOString())
    .order("ts", { ascending: true });
  if (error) { console.error("fetchTodayPunches:", error.message); return null; }
  return data;
}

export async function fetchPeriodPunches(employeeId, fromISO, toISO) {
  if (!isSupabaseReady) return null;
  const { data, error } = await supabase
    .from("attendance_logs").select("*")
    .eq("employee_id", employeeId).gte("ts", fromISO).lte("ts", toISO)
    .order("ts", { ascending: true });
  if (error) { console.error("fetchPeriodPunches:", error.message); return null; }
  return data;
}

// การตอกบัตรของ "ทุกคน" ในวันเดียว — สำหรับมุมมองผู้บริหาร "ทุกคน (ต่อวัน)"
export async function fetchDayPunchesAllEmployees(fromISO, toISO) {
  if (!isSupabaseReady) return [];
  const { data, error } = await supabase
    .from("attendance_logs").select("*")
    .gte("ts", fromISO).lte("ts", toISO)
    .order("ts", { ascending: true });
  if (error) { console.error("fetchDayPunchesAllEmployees:", error.message); return []; }
  return data;
}

// ---------- บันทึกหักเงิน (แก้บั๊ก deduct_logs) ----------
export async function saveDeduction({ employeeId, period, type, amount, note, createdBy, createdByName }) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("deduct_logs").insert({
    employee_id: employeeId, period, type, amount, note,
    created_by: createdBy, created_by_name: createdByName,
  });
  if (error) { console.error("saveDeduction:", error.message); return { error: error.message }; }
  return { ok: true };
}

export async function listDeductions(period) {
  if (!isSupabaseReady) return null;
  let q = supabase.from("deduct_logs").select("*").order("created_at", { ascending: false });
  if (period) q = q.eq("period", period);
  const { data, error } = await q;
  if (error) { console.error("listDeductions:", error.message); return null; }
  return data;
}

// รายการหักเงิน "ทุกคน" ในวันเดียว (อิงจากวันที่บันทึก) — ใช้กับมุมมองผู้บริหาร "ทุกคน (ต่อวัน)"
export async function listDeductionsForDay(fromISO, toISO) {
  if (!isSupabaseReady) return [];
  const { data, error } = await supabase
    .from("deduct_logs").select("*")
    .gte("created_at", fromISO).lte("created_at", toISO);
  if (error) { console.error("listDeductionsForDay:", error.message); return []; }
  return data;
}

export async function listDeductionsForEmployee(employeeId, period) {
  if (!isSupabaseReady) return null;
  let q = supabase.from("deduct_logs").select("*").eq("employee_id", employeeId);
  if (period) q = q.eq("period", period);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) { console.error("listDeductionsForEmployee:", error.message); return null; }
  return data;
}

// ---------- คำขออนุมัติ (โชว์ชื่อผู้อนุมัติ — req 3,4,6) ----------
export async function createApproval({ requestType, employeeId, detail, payload }) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("approvals").insert({
    request_type: requestType, employee_id: employeeId, detail, payload: payload || null, status: "pending",
  });
  if (error) { console.error("createApproval:", error.message); return { error: error.message }; }
  return { ok: true };
}

export async function listApprovals(status = "pending") {
  if (!isSupabaseReady) return null;
  const { data, error } = await supabase
    .from("approvals").select("*").eq("status", status)
    .order("created_at", { ascending: false });
  if (error) { console.error("listApprovals:", error.message); return null; }
  return data;
}

// ประวัติคำขอของพนักงานคนเดียว (โชว์ชื่อผู้อนุมัติย้อนหลังได้ ไม่ใช่แค่ session เดียว)
export async function listApprovalsForEmployee(employeeId) {
  if (!isSupabaseReady) return [];
  const { data, error } = await supabase
    .from("approvals").select("*").eq("employee_id", employeeId)
    .order("created_at", { ascending: false }).limit(20);
  if (error) { console.error("listApprovalsForEmployee:", error.message); return []; }
  return data;
}

export async function decideApproval({ id, status, approverId, approverName }) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("approvals").update({
    status, approver_id: approverId, approver_name: approverName,
    decided_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) { console.error("decideApproval:", error.message); return { error: error.message }; }
  return { ok: true };
}

// ---------- นำคำขอที่อนุมัติแล้วไปมีผลจริง ----------
// แก้เวลาเข้า/เลิกงาน: หาการตอกบัตรวันนั้น (ประเภทเดียวกัน) มาแก้ ถ้าไม่มีให้เพิ่มใหม่
export async function applyTimeEdit({ employeeId, dateKey, punchType, newTime }) {
  if (!isSupabaseReady) return { demo: true };
  const [h, m] = newTime.split(":").map(Number);
  const ts = new Date(dateKey); ts.setHours(h, m, 0, 0);
  const dayStart = new Date(dateKey); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dateKey); dayEnd.setHours(23, 59, 59, 999);

  const { data: existing, error: findErr } = await supabase
    .from("attendance_logs").select("id")
    .eq("employee_id", employeeId).eq("punch_type", punchType)
    .gte("ts", dayStart.toISOString()).lte("ts", dayEnd.toISOString()).limit(1);
  if (findErr) { console.error("applyTimeEdit find:", findErr.message); return { error: findErr.message }; }

  if (existing && existing.length) {
    const { error } = await supabase.from("attendance_logs").update({ ts: ts.toISOString() }).eq("id", existing[0].id);
    if (error) { console.error("applyTimeEdit update:", error.message); return { error: error.message }; }
  } else {
    const { error } = await supabase.from("attendance_logs").insert({ employee_id: employeeId, punch_type: punchType, ts: ts.toISOString() });
    if (error) { console.error("applyTimeEdit insert:", error.message); return { error: error.message }; }
  }
  return { ok: true };
}

// บันทึก OT แบบ manual ที่ผู้บริหารอนุมัติ (บวกเพิ่มจาก OT ที่คำนวณจากตอกบัตร)
export async function recordManualOt({ employeeId, period, otDate, minutes, note, approvedBy, approvedByName }) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("ot_logs").insert({
    employee_id: employeeId, period, ot_date: otDate, minutes, note,
    approved_by: approvedBy, approved_by_name: approvedByName,
  });
  if (error) { console.error("recordManualOt:", error.message); return { error: error.message }; }
  return { ok: true };
}
export async function getManualOtMinutes(employeeId, period) {
  if (!isSupabaseReady) return 0;
  const { data, error } = await supabase.from("ot_logs").select("minutes").eq("employee_id", employeeId).eq("period", period);
  if (error) { console.error("getManualOtMinutes:", error.message); return 0; }
  return (data || []).reduce((s, r) => s + Number(r.minutes || 0), 0);
}

// ---------- วันลา (โควตา + ประวัติ) ----------
export async function recordLeave({ employeeId, leaveType, days, leaveDate, note, approvedBy, approvedByName }) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("leave_logs").insert({
    employee_id: employeeId, leave_type: leaveType, days, leave_date: leaveDate, note,
    approved_by: approvedBy, approved_by_name: approvedByName,
  });
  if (error) { console.error("recordLeave:", error.message); return { error: error.message }; }
  return { ok: true };
}
export async function listLeaveLogsForEmployee(employeeId) {
  if (!isSupabaseReady) return [];
  const { data, error } = await supabase.from("leave_logs").select("*").eq("employee_id", employeeId).order("leave_date", { ascending: false });
  if (error) { console.error("listLeaveLogsForEmployee:", error.message); return []; }
  return data;
}

// ---------- จัดการพนักงาน (สร้าง/แก้/เปิด-ปิด/ลบถาวร) ----------
export async function createEmployee(emp) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("employees").insert(emp);
  if (error) { console.error("createEmployee:", error.message); return { error: error.message }; }
  return { ok: true };
}

// ลบถาวร — ผ่าน RPC (employees ไม่มี select/delete policy) ลบแล้วประวัติที่ผูกไว้หายตามด้วย (cascade)
export async function adminDeleteEmployee(id) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.rpc("admin_delete_employee", { p_id: id });
  if (error) { console.error("adminDeleteEmployee:", error.message); return { error: error.message }; }
  return { ok: true };
}

export async function updateEmployee(id, patch) {
  if (!isSupabaseReady) return { demo: true };
  // ผ่าน RPC SECURITY DEFINER (employees ไม่มี SELECT policy → PATCH ตรงไม่ติด)
  const { error } = await supabase.rpc("admin_update_employee", {
    p_id: id,
    p_name: patch.name ?? null,
    p_role: patch.role ?? null,
    p_department: patch.department ?? null,
    p_company_id: patch.company_id ?? null,
    p_branch_id: patch.branch_id ?? null,
    p_shift_id: patch.shift_id ?? null,
    p_position: patch.position ?? null,
    p_pay_type: patch.pay_type ?? null,
    p_base_salary: patch.base_salary ?? null,
    p_start_date: patch.start_date ?? null,
    p_active: patch.active ?? null,
    p_username: patch.username ?? null,
    p_password: patch.password ?? null,
    p_sso: patch.sso ?? null,
    p_off_days: patch.off_days ?? null,
    p_leave_sick_quota: patch.leave_sick_quota ?? null,
    p_leave_personal_quota: patch.leave_personal_quota ?? null,
    p_leave_vacation_quota: patch.leave_vacation_quota ?? null,
  });
  if (error) { console.error("updateEmployee:", error.message); return { error: error.message }; }
  return { ok: true };
}

// ---------- ยกเว้นไม่หักเงิน (สาย/ขาด รายวัน) ----------
export async function listWaiversRange(fromDate, toDate) {
  if (!isSupabaseReady) return [];
  const { data, error } = await supabase.from("attendance_waivers").select("*").gte("waive_date", fromDate).lte("waive_date", toDate);
  if (error) { console.error("listWaiversRange:", error.message); return []; }
  return data;
}
export async function setWaiver({ employeeId, dateKey, kind, createdBy, createdByName }) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("attendance_waivers").upsert(
    { employee_id: employeeId, waive_date: dateKey, kind, created_by: createdBy, created_by_name: createdByName },
    { onConflict: "employee_id,waive_date" }
  );
  if (error) { console.error("setWaiver:", error.message); return { error: error.message }; }
  return { ok: true };
}
export async function removeWaiver(employeeId, dateKey) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("attendance_waivers").delete().eq("employee_id", employeeId).eq("waive_date", dateKey);
  if (error) { console.error("removeWaiver:", error.message); return { error: error.message }; }
  return { ok: true };
}

// ---------- จัดการกะ (shifts มี RLS read+write ครบ → PATCH/insert/delete ตรงได้) ----------
export async function saveShiftType(shift) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("shifts").upsert(shift);
  if (error) { console.error("saveShiftType:", error.message); return { error: error.message }; }
  return { ok: true };
}
export async function deleteShiftType(id) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) { console.error("deleteShiftType:", error.message); return { error: error.message }; }
  return { ok: true };
}

// ---------- จัดการสาขา (branches มี RLS read+write ครบ → PATCH/insert/delete ตรงได้) ----------
export async function saveBranch(branch) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("branches").upsert(branch);
  if (error) { console.error("saveBranch:", error.message); return { error: error.message }; }
  return { ok: true };
}
export async function deleteBranch(id) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("branches").delete().eq("id", id);
  if (error) { console.error("deleteBranch:", error.message); return { error: error.message }; }
  return { ok: true };
}

// ---------- ประเภทการหัก (เพิ่มหัวข้อเองได้) ----------
export async function listDeductTypes() {
  if (!isSupabaseReady) return null;
  const { data, error } = await supabase.from("deduct_types").select("name").order("created_at");
  if (error) { console.error("listDeductTypes:", error.message); return null; }
  return data.map((d) => d.name);
}
export async function addDeductType(name) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("deduct_types").insert({ name });
  if (error) { console.error("addDeductType:", error.message); return { error: error.message }; }
  return { ok: true };
}

// ---------- ยอดยกมา (carry-forward) ----------
export async function getCarry(employeeId, period) {
  if (!isSupabaseReady) return null;
  const { data, error } = await supabase.from("payroll_carry").select("amount").eq("employee_id", employeeId).eq("period", period).maybeSingle();
  if (error) { console.error("getCarry:", error.message); return null; }
  return data ? Number(data.amount) : 0;
}
export async function saveCarry(employeeId, period, amount) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("payroll_carry").upsert({ employee_id: employeeId, period, amount }, { onConflict: "employee_id,period" });
  if (error) { console.error("saveCarry:", error.message); return { error: error.message }; }
  return { ok: true };
}

// ---------- กำหนด/เปลี่ยนกะ (req 6) ----------
export async function setEmployeeShift(employeeId, shiftId) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.rpc("admin_update_employee", { p_id: employeeId, p_shift_id: shiftId });
  if (error) { console.error("setEmployeeShift:", error.message); return { error: error.message }; }
  return { ok: true };
}
