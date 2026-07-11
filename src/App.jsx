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
import { isManager, isExec, ROLE_LABEL } from "./lib/rules.js";

const AUTH_KEY = "hr_authed";
const EMP_KEY = "hr_emp";

const TABS = [
  { id: "checkin",   label: "เช็คอิน",   icon: "🕐", Comp: CheckIn },
  { id: "timesheet", label: "ตารางเวลา", icon: "🗓️", Comp: Timesheet },
  { id: "payslip",   label: "สลิป",      icon: "🧾", Comp: Payslip },
  { id: "approve",   label: "อนุมัติ",   icon: "✅", Comp: Approvals,  manager: true },
  { id: "deduct",    label: "หักเงิน",   icon: "➖", Comp: Deductions, manager: true },
  { id: "shifts",    label: "กำหนดกะ",  icon: "🔁", Comp: Shifts,     manager: true },
  { id: "staff",     label: "พนักงาน",   icon: "👥", Comp: Employees,  exec: true },
  { id: "branches",  label: "สาขา",      icon: "🏢", Comp: Branches,   exec: true },
  { id: "shifttypes",label: "ตั้งเวลากะ", icon: "⏰", Comp: ShiftTypes, exec: true },
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
    <div className="min-h-screen bg-slate-100 lg:flex" style={TH}>
      {/* ===== Sidebar (เดสก์ท็อป lg+) ===== */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        {/* แบรนด์ */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-center leading-none">
            <span className="text-sm font-extrabold text-fuchsia-600">บ<span className="text-amber-500">S</span></span>
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-800">เบเกอร์บรรจุภัณฑ์</div>
            <div className="text-xs text-slate-400">กาฬสินธุ์ · ระบบ HR</div>
          </div>
        </div>

        {/* เมนู */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
                }`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${active ? "bg-emerald-100" : "bg-slate-100"}`}>{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* ผู้ใช้ + ออกจากระบบ */}
        <div className="border-t border-slate-100 p-3">
          <div className="mb-2 flex items-center gap-2 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
              {(employee?.name || "?").slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-700">{employee?.name}</div>
              <div className="text-xs text-slate-400">{ROLE_LABEL[employee?.role] || "พนักงาน"}</div>
            </div>
          </div>
          <button onClick={logout}
            className="w-full rounded-xl bg-slate-50 py-2 text-sm font-medium text-rose-500 ring-1 ring-slate-200 hover:bg-rose-50">
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* ===== เนื้อหา ===== */}
      <div className="min-w-0 flex-1 pb-24 lg:pb-0 lg:pl-64">
        <Active employee={employee} />
      </div>

      {/* แถบบน (มือถือเท่านั้น) */}
      <div className="fixed right-3 top-3 z-20 flex items-center gap-2 lg:hidden">
        <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow ring-1 ring-slate-200">
          {employee?.name} · {ROLE_LABEL[employee?.role] || "พนักงาน"}
        </span>
        <button onClick={logout}
          className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-rose-500 shadow ring-1 ring-slate-200">
          ออก
        </button>
      </div>

      {/* แถบเมนูล่าง (มือถือเท่านั้น) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white lg:hidden">
        <div className="mx-auto flex max-w-2xl overflow-x-auto">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex min-w-[64px] flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${active ? "text-emerald-600" : "text-slate-400"}`}>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full text-base ${active ? "bg-emerald-50" : ""}`}>{t.icon}</span>
                <span className={active ? "font-semibold" : ""}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
