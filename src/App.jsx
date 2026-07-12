import { useState } from "react";
import Login from "./Login.jsx";
import CheckIn from "./CheckIn.jsx";
import Timesheet from "./Timesheet.jsx";
import Payslip from "./Payslip.jsx";
import Approvals from "./admin/Approvals.jsx";
import Deductions from "./admin/Deductions.jsx";
import Shifts from "./admin/Shifts.jsx";
import Employees from "./admin/Employees.jsx";
import Branches from "./admin/Branches.jsx";
import ShiftTypes from "./admin/ShiftTypes.jsx";
import AttendanceIssues from "./admin/AttendanceIssues.jsx";
import { isManager, isExec, ROLE_LABEL } from "./lib/rules.js";

const AUTH_KEY = "hr_authed";
const EMP_KEY = "hr_emp";

const TABS = [
  { id: "checkin",   label: "เช็คอิน",   icon: "🕐", Comp: CheckIn },
  { id: "timesheet", label: "ตารางเวลา", icon: "🗓️", Comp: Timesheet },
  { id: "payslip",   label: "สลิป",      icon: "🧾", Comp: Payslip },
  { id: "approve",   label: "อนุมัติ",   icon: "✅", Comp: Approvals,  manager: true },
  { id: "staff",     label: "พนักงาน",   icon: "👥", Comp: Employees,  exec: true },
  { id: "shifts",    label: "กำหนดกะ",  icon: "🔁", Comp: Shifts,     manager: true },
  { id: "deduct",    label: "หักเงิน",   icon: "➖", Comp: Deductions, manager: true },
  { id: "branches",  label: "สาขา",      icon: "🏢", Comp: Branches,   exec: true },
  { id: "shifttypes",label: "ตั้งเวลากะ", icon: "⏰", Comp: ShiftTypes, exec: true },
  { id: "issues",    label: "ขาด-สาย",   icon: "🚨", Comp: AttendanceIssues, exec: true },
];

const TH = { fontFamily: '"Sarabun","Noto Sans Thai","Prompt",sans-serif' };

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === "1");
  const [employee, setEmployee] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(EMP_KEY)); } catch { return null; }
  });
  const [tab, setTab] = useState("checkin");

  function login(emp) {
    sessionStorage.setItem(AUTH_KEY, "1");
    if (emp) sessionStorage.setItem(EMP_KEY, JSON.stringify(emp));
    setEmployee(emp || null);
    setAuthed(true);
  }
  function logout() {
    sessionStorage.clear();
    setEmployee(null);
    setAuthed(false);
    setTab("checkin");
  }

  if (!authed) return <Login onSuccess={login} />;

  const manager = isManager(employee?.role);
  const exec = isExec(employee?.role);
  const tabs = TABS.filter((t) => (t.exec ? exec : t.manager ? manager : true));
  const Active = (tabs.find((t) => t.id === tab) || tabs[0]).Comp;

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50" style={TH}>
      {/* ===== แบรนด์ + ผู้ใช้ ===== */}
      <div className="bg-gradient-to-r from-pink-700 via-rose-800 to-stone-900 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow">
            <img src="/logo.png" alt="เขเกอรรี่บรรจุภัณฑ์" className="h-full w-full object-contain p-1" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-pink-200">{ROLE_LABEL[employee?.role] || "พนักงาน"}</div>
            <div className="truncate text-base font-bold text-white sm:text-lg">เบเกอร์บรรจุภัณฑ์ กาฬสินธุ์</div>
          </div>
          <button onClick={logout}
            className="shrink-0 rounded-xl bg-stone-900/60 px-4 py-2.5 text-xs font-semibold text-white ring-1 ring-white/20 hover:bg-stone-900">
            ออกจากระบบ
          </button>
        </div>
      </div>

      {/* ===== แท็บเมนู (เลื่อนแนวนอน) ===== */}
      <div className="border-b border-amber-100 bg-white/70 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 py-3 sm:px-6">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active ? "bg-pink-700 text-white shadow" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-pink-50"
                }`}>
                <span>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ===== เนื้อหา ===== */}
      <Active employee={employee} />
    </div>
  );
}
