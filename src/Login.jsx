import { useState } from "react";
import { loginByCredentials } from "./lib/db.js";
import { isSupabaseReady } from "./lib/supabase.js";

/**
 * เข้าสู่ระบบด้วย username + password (req 7)
 * - ต่อ Supabase: RPC login_by_credentials
 * - โหมดเดโม (ยังไม่ตั้ง env): บัญชีตัวอย่างในเครื่อง
 */
const DEMO_USERS = {
  admin:   { password: "admin1234", emp: { id: "demo-exec", code: "EMP-000", name: "ผู้บริหาร", role: "exec", department: "front", company_id: "bakery", branch_id: "b1", shift_id: "morning", position: "ผู้บริหาร", pay_type: "monthly", base_salary: 30000 } },
  head1:   { password: "head1234",  emp: { id: "demo-head", code: "EMP-001", name: "หัวหน้าสาขา", role: "head", department: "front", company_id: "bakery", branch_id: "b1", shift_id: "morning", position: "หัวหน้าสาขา", pay_type: "monthly", base_salary: 18000 } },
  somying: { password: "1234",      emp: { id: "demo-emp1", code: "EMP-002", name: "สมหญิง ใจดี", role: "employee", department: "front", company_id: "bakery", branch_id: "b1", shift_id: "morning", position: "พนักงานขาย", pay_type: "monthly", base_salary: 13000 } },
  prayut:  { password: "1234",      emp: { id: "demo-emp2", code: "EMP-003", name: "ประยุทธ์ ขยันงาน", role: "employee", department: "back", company_id: "bakery", branch_id: "b1", shift_id: "morning", position: "พนักงานครัว", pay_type: "monthly", base_salary: 12000 } },
};

export default function Login({ onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e?.preventDefault();
    if (busy || !username || !password) return;
    setBusy(true); setError("");
    try {
      const emp = await loginByCredentials(username.trim(), password);
      if (emp === undefined) {
        // โหมดเดโม
        const u = DEMO_USERS[username.trim().toLowerCase()];
        if (u && u.password === password) return onSuccess(u.emp);
        setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      } else if (emp) {
        onSuccess(emp);
      } else {
        setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-gradient-to-b from-amber-700 to-amber-900 px-6 pt-16">
      <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-rose-50 shadow-lg">
        <div className="text-center leading-tight">
          <div className="text-xl font-extrabold text-fuchsia-600">เบเกอร์<span className="text-amber-500">S</span></div>
          <div className="text-xs font-bold text-fuchsia-700">บรรจุภัณฑ์</div>
          <div className="mt-1 text-[9px] text-slate-500">กาฬสินธุ์</div>
        </div>
      </div>
      <h1 className="mt-5 text-2xl font-bold text-white">เข้าสู่ระบบ</h1>

      <form onSubmit={submit} className="mt-6 w-full max-w-sm space-y-3 rounded-3xl bg-white p-6 shadow-xl">
        <label className="block">
          <span className="text-sm text-slate-500">ชื่อผู้ใช้ (username)</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-amber-500"
            placeholder="เช่น somying" />
        </label>
        <label className="block">
          <span className="text-sm text-slate-500">รหัสผ่าน</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-amber-500"
            placeholder="••••••" />
        </label>

        {error && <p className="text-center text-sm text-rose-500">{error}</p>}

        <button type="submit" disabled={!username || !password || busy}
          className={`w-full rounded-2xl py-3.5 text-base font-bold text-white transition ${
            !username || !password || busy ? "cursor-not-allowed bg-slate-300" : "bg-emerald-600 active:bg-emerald-700"
          }`}>
          {busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>

      {!isSupabaseReady && (
        <div className="mt-4 max-w-sm text-center text-xs text-white/70">
          โหมดเดโม · ลองเข้าด้วย: <b>admin/admin1234</b> (ผู้บริหาร), <b>head1/head1234</b> (หัวหน้า), <b>somying/1234</b> (พนักงานหน้าร้าน), <b>prayut/1234</b> (หลังร้าน)
        </div>
      )}
    </div>
  );
}
