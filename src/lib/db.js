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
export async function savePunch({ employeeId, punchType, lat, lng, distance, branchId }) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("attendance_logs").insert({
    employee_id: employeeId, punch_type: punchType, lat, lng, distance, branch_id: branchId,
  });
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

// ---------- คำขออนุมัติ (โชว์ชื่อผู้อนุมัติ — req 3,4,6) ----------
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

// ---------- กำหนด/เปลี่ยนกะ (req 6) ----------
export async function setEmployeeShift(employeeId, shiftId) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("employees").update({ shift_id: shiftId }).eq("id", employeeId);
  if (error) { console.error("setEmployeeShift:", error.message); return { error: error.message }; }
  return { ok: true };
}
