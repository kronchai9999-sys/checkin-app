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

export async function listDeductionsForEmployee(employeeId, period) {
  if (!isSupabaseReady) return null;
  let q = supabase.from("deduct_logs").select("*").eq("employee_id", employeeId);
  if (period) q = q.eq("period", period);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) { console.error("listDeductionsForEmployee:", error.message); return null; }
  return data;
}

// ---------- คำขออนุมัติ (โชว์ชื่อผู้อนุมัติ — req 3,4,6) ----------
export async function createApproval({ requestType, employeeId, detail }) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("approvals").insert({
    request_type: requestType, employee_id: employeeId, detail, status: "pending",
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

export async function decideApproval({ id, status, approverId, approverName }) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("approvals").update({
    status, approver_id: approverId, approver_name: approverName,
    decided_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) { console.error("decideApproval:", error.message); return { error: error.message }; }
  return { ok: true };
}

// ---------- จัดการพนักงาน (สร้าง/แก้/เปิด-ปิด) ----------
export async function createEmployee(emp) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("employees").insert(emp);
  if (error) { console.error("createEmployee:", error.message); return { error: error.message }; }
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
  });
  if (error) { console.error("updateEmployee:", error.message); return { error: error.message }; }
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
