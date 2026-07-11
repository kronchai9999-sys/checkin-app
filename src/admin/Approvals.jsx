import { useState, useEffect } from "react";
import { listApprovals, decideApproval, listEmployees } from "../lib/db.js";
import { DEMO_EMPLOYEES, DEMO_APPROVALS } from "../lib/demo.js";
import { canApprove, isManager, ROLE_LABEL } from "../lib/rules.js";
import { Blocked } from "./Deductions.jsx";

const TH = { fontFamily: '"Sarabun","Noto Sans Thai","Prompt",sans-serif' };
const TYPE_LABEL = {
  shift_change: "ขอเปลี่ยนกะ",
  leave: "ขอลา",
  time_edit: "ขอแก้เวลาทำงาน",
  ot_edit: "ขอแก้ OT",
  general: "คำขอทั่วไป",
};

export default function Approvals({ employee }) {
  const manager = isManager(employee?.role);
  const role = employee?.role;
  const [emps, setEmps] = useState(DEMO_EMPLOYEES);
  const [rows, setRows] = useState(DEMO_APPROVALS);
  const [done, setDone] = useState([]);     // เดโม: เก็บผลอนุมัติในเครื่อง
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    listEmployees().then((l) => l && l.length && setEmps(l));
    listApprovals("pending").then((l) => { if (l) setRows(l); });
  }, []);

  const empName = (id) => emps.find((e) => e.id === id)?.name || id;

  async function decide(row, status) {
    if (!canApprove(role, row.request_type)) return;
    setBusyId(row.id);
    const res = await decideApproval({
      id: row.id, status, approverId: employee?.id, approverName: employee?.name,
    });
    setBusyId(null);
    if (res?.error) return;
    // เอาออกจากรายการรอ + จำผลไว้แสดง (โชว์ชื่อผู้อนุมัติ — req 4)
    setRows((r) => r.filter((x) => x.id !== row.id));
    setDone((d) => [{ ...row, status, approver_name: employee?.name, decided_at: new Date().toISOString() }, ...d]);
  }

  if (!manager) return <Blocked text="หน้าอนุมัติสำหรับหัวหน้า/ผู้บริหารเท่านั้น" />;

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6" style={TH}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">รายการรออนุมัติ</h1>
          <p className="text-sm text-slate-500">
            คุณคือ <b>{ROLE_LABEL[role]}</b>
            {role === "head" && " — อนุมัติได้ทุกอย่าง ยกเว้น “แก้เวลาทำงาน” และ “แก้ OT” (ต้องผู้บริหาร)"}
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-2xl bg-white py-8 text-center text-sm text-slate-400 shadow-sm">ไม่มีรายการรออนุมัติ</p>
        ) : rows.map((row) => {
          const allowed = canApprove(role, row.request_type);
          return (
            <div key={row.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{TYPE_LABEL[row.request_type] || row.request_type}</span>
                    <span className="text-sm font-semibold text-slate-800">{empName(row.employee_id)}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{row.detail}</div>
                </div>
              </div>
              {allowed ? (
                <div className="mt-3 flex gap-2">
                  <button disabled={busyId === row.id} onClick={() => decide(row, "approved")}
                    className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white active:bg-emerald-700 disabled:bg-slate-300">อนุมัติ</button>
                  <button disabled={busyId === row.id} onClick={() => decide(row, "rejected")}
                    className="flex-1 rounded-xl bg-white py-2 text-sm font-semibold text-rose-500 ring-1 ring-rose-200">ไม่อนุมัติ</button>
                </div>
              ) : (
                <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  🔒 หัวหน้าอนุมัติรายการนี้ไม่ได้ — ต้องให้ <b>ผู้บริหาร</b> เป็นผู้อนุมัติ
                </div>
              )}
            </div>
          );
        })}

        {/* ประวัติที่เพิ่งอนุมัติ (โชว์ชื่อผู้อนุมัติ) */}
        {done.length > 0 && (
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">เพิ่งตัดสิน</h2>
            <div className="divide-y divide-slate-100">
              {done.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700">{empName(d.employee_id)} · {TYPE_LABEL[d.request_type] || d.request_type}</span>
                  <span className={d.status === "approved" ? "text-emerald-600" : "text-rose-500"}>
                    {d.status === "approved" ? "อนุมัติ" : "ไม่อนุมัติ"} โดย {d.approver_name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
