import { useState } from "react";
import PinLogin from "./PinLogin.jsx";
import CheckIn from "./CheckIn.jsx";
import Timesheet from "./Timesheet.jsx";
import Payslip from "./Payslip.jsx";

const AUTH_KEY = "checkin_authed";
const EMP_KEY = "checkin_emp";

const TABS = [
  { id: "checkin", label: "เช็คอิน", icon: "🕐", Comp: CheckIn },
  { id: "timesheet", label: "ตารางเวลา", icon: "🗓️", Comp: Timesheet },
  { id: "payslip", label: "สลิป", icon: "🧾", Comp: Payslip },
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
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(EMP_KEY);
    setEmployee(null);
    setAuthed(false);
  }

  if (!authed) return <PinLogin onSuccess={login} />;

  const Active = TABS.find((t) => t.id === tab).Comp;

  return (
    <div className="min-h-screen bg-slate-100 pb-20">
      <Active employee={employee} />

      {/* ปุ่มออกจากระบบ */}
      <button onClick={logout}
        className="fixed right-3 top-3 z-20 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-500 shadow ring-1 ring-slate-200">
        ออกจากระบบ
      </button>

      {/* แถบเมนูล่าง */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-md">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${active ? "text-emerald-600" : "text-slate-400"}`}>
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
