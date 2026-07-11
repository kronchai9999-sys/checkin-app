import { supabase, isSupabaseReady } from "./supabase.js";

/**
 * Data layer — ทุกฟังก์ชันปลอดภัยเมื่อยังไม่ได้ต่อ Supabase
 * (คืน null/[] แล้วให้ UI ใช้ข้อมูลเดโมแทน)
 */

// ---------- ล็อกอินด้วย PIN ----------
// คืน employee (ไม่มี pin) ถ้า PIN ถูก, คืน null ถ้าผิด, คืน undefined ถ้าไม่ได้ต่อ DB
export async function loginByPin(pin) {
  if (!isSupabaseReady) return undefined;          // โหมดเดโม → ให้ caller เทียบ DEMO_PIN
  const { data, error } = await supabase.rpc("login_by_pin", { p_pin: pin });
  if (error) {
    console.error("loginByPin error:", error.message);
    return undefined;                              // มีปัญหา DB → ตกไปโหมดเดโม
  }
  return (data && data[0]) || null;                // null = PIN ผิด
}

// ---------- ตัวเลือกบริษัท/สาขา/กะ (สำหรับหน้าเช็คอิน) ----------
export async function fetchCompanies() {
  if (!isSupabaseReady) return null;
  const [{ data: companies }, { data: branches }, { data: shifts }] = await Promise.all([
    supabase.from("companies").select("*").order("name"),
    supabase.from("branches").select("*"),
    supabase.from("shifts").select("*"),
  ]);
  if (!companies) return null;
  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    branches: (branches || [])
      .filter((b) => b.company_id === c.id)
      .map((b) => ({ id: b.id, name: b.name, lat: b.lat, lng: b.lng, radius: b.radius })),
    shifts: (shifts || [])
      .filter((s) => s.company_id === c.id)
      .map((s) => ({ id: s.id, name: s.name, start: s.start_time, end: s.end_time })),
  }));
}

// ---------- บันทึกการตอกบัตร ----------
export async function savePunch({ employeeId, punchType, lat, lng, distance, branchId }) {
  if (!isSupabaseReady) return { demo: true };
  const { error } = await supabase.from("attendance_logs").insert({
    employee_id: employeeId,
    punch_type: punchType,
    lat,
    lng,
    distance,
    branch_id: branchId,
  });
  if (error) {
    console.error("savePunch error:", error.message);
    return { error: error.message };
  }
  return { ok: true };
}

// ---------- การตอกบัตรของพนักงานวันนี้ ----------
export async function fetchTodayPunches(employeeId) {
  if (!isSupabaseReady) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("ts", start.toISOString())
    .order("ts", { ascending: true });
  if (error) {
    console.error("fetchTodayPunches error:", error.message);
    return null;
  }
  return data;
}

// ---------- รายชื่อพนักงาน (สำหรับหน้า Timesheet/Payslip ฝั่งแอดมิน) ----------
// หมายเหตุ: view นี้ไม่ส่ง pin (ดึงจาก attendance ผ่านการ join ไม่ได้เพราะ RLS ปิด employees)
// ระบบจริงควรทำ RPC/มุมมองสำหรับแอดมินโดยเฉพาะ — เฟสนี้ยังใช้ข้อมูลเดโมในสองหน้านั้น
export async function fetchPeriodPunches(employeeId, fromISO, toISO) {
  if (!isSupabaseReady) return null;
  const { data, error } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("ts", fromISO)
    .lte("ts", toISO)
    .order("ts", { ascending: true });
  if (error) {
    console.error("fetchPeriodPunches error:", error.message);
    return null;
  }
  return data;
}
