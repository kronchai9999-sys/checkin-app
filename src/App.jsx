import { useState } from "react";
import Login from "./Login.jsx";
import CheckIn from "./CheckIn.jsx";
import Timesheet from "./Timesheet.jsx";
import Payslip from "./Payslip.jsx";
import Approvals from "./admin/Approvals.jsx";
import Deductions from "./admin/Deductions.jsx";
import Shifts from "./admin/Shifts.jsx";
import { isManager, ROLE_LABEL } from "./lib/rules.js";

const AUTH_KEY = "hr_authed";
const EMP_KEY = "hr_emp";

// tab.roles = ใครเห็นแท็บนี้ (undefined = ทุกคน)
const TABS = [
  { id: "checkin",   label: "เช็คอิน",   icon: "🕐", Comp: CheckIn },
  { id: "timesheet", label: "ตารางเวลา", icon: "🗓️", Comp: Timesheet },
  { id: "payslip",   label: "สลิป",      icon: "🧾", Comp: Payslip },
  { id: "approve",   label: "อนุมัติ",   icon: "✅", Comp: Approvals,  manager: true },
  { id: "deduct",    label: "หักเงิน",   icon: "➖", Comp: Deductions, manager: true },
  { id: "shifts",    label: "กำหนดกะ",  icon: "🔁", Comp: Shifts,     manager: true },
];

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
  const tabs = TABS.filter((t) => !t.manager || manager);
  const Active = (tabs.find((t) => t.id === tab) || tabs[0]).Comp;

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <Active employee={employee} />

      {/* แถบบน: ชื่อ + บทบาท + ออกจากระบบ */}
      <div className="fixed right-3 top-3 z-20 flex items-center gap-2">
        <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow ring-1 ring-slate-200">
          {employee?.name} · {ROLE_LABEL[employee?.role] || "พนักงาน"}
        </span>
        <button onClick={logout}
          className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-rose-500 shadow ring-1 ring-slate-200">
          ออกจากระบบ
        </button>
      </div>

      {/* แถบเมนูล่าง */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white">
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
