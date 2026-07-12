import { useState, useEffect } from "react";
import { listApprovals, decideApproval, listEmployees, applyTimeEdit, recordManualOt, recordLeave } from "../lib/db.js";
import { isSupabaseReady } from "../lib/supabase.js";
import { DEMO_EMPLOYEES, DEMO_APPROVALS } from "../lib/demo.js";
import { periodLabelForDate } from "../lib/payroll.js";
import { canApprove, isManager, ROLE_LABEL } from "../lib/rules.js";
import { Page, PageHeader, Card, Badge, Empty, DemoTag } from "../ui.jsx";

const TYPE_LABEL = { shift_change: "ขอเปลี่ยนกะ", leave: "ขอลา", time_edit: "ขอแก้เวลาทำงาน", ot_edit: "ขอแก้ OT", general: "คำขอทั่วไป" };
const AUTO_APPLY_TYPES = new Set(["time_edit", "ot_edit", "leave"]);

export default function Approvals({ employee }) {
  const manager = isManager(employee?.role);
  const role = employee?.role;
  const [emps, setEmps] = useState(DEMO_EMPLOYEES);
  const [rows, setRows] = useState(DEMO_APPROVALS);
  const [done, setDone] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [errMsg, setErrMsg] = useState(null);   // { id, text }

  useEffect(() => {
    listEmployees().then((l) => l && l.length && setEmps(l));
    listApprovals("pending").then((l) => { if (l) setRows(l); });
  }, []);

  const empName = (id) => emps.find((e) => e.id === id)?.name || id;

  // อนุมัติ "แก้เวลา/แก้ OT/ลา" แล้วให้มีผลจริงทันที (แก้ attendance_logs / เพิ่ม ot_logs / หักโควตาลา)
  async function applyPayload(row) {
    if (!row.payload) return { ok: true };
    if (row.request_type === "time_edit") {
      return applyTimeEdit({ employeeId: row.employee_id, dateKey: row.payload.date, punchType: row.payload.punchType, newTime: row.payload.newTime });
    }
    if (row.request_type === "ot_edit") {
      return recordManualOt({
        employeeId: row.employee_id, period: periodLabelForDate(row.payload.date),
        otDate: row.payload.date, minutes: row.payload.minutes, note: row.detail,
        approvedBy: employee?.id, approvedByName: employee?.name,
      });
    }
    if (row.request_type === "leave") {
      return recordLeave({
        employeeId: row.employee_id, leaveType: row.payload.leaveType, days: row.payload.days,
        leaveDate: row.payload.fromDate, note: row.detail,
        approvedBy: employee?.id, approvedByName: employee?.name,
      });
    }
    return { ok: true };
  }

  async function decide(row, status) {
    if (!canApprove(role, row.request_type)) return;
    setBusyId(row.id); setErrMsg(null);

    if (status === "approved") {
      const applyRes = await applyPayload(row);
      if (applyRes?.error) {
        setBusyId(null);
        setErrMsg({ id: row.id, text: "อนุมัติไม่สำเร็จ: " + applyRes.error });
        return;
      }
    }

    const res = await decideApproval({ id: row.id, status, approverId: employee?.id, approverName: employee?.name });
    setBusyId(null);
    if (res?.error) { setErrMsg({ id: row.id, text: "บันทึกสถานะไม่สำเร็จ: " + res.error }); return; }
    setRows((r) => r.filter((x) => x.id !== row.id));
    setDone((d) => [{ ...row, status, approver_name: employee?.name }, ...d]);
  }

  if (!manager) return <Page><PageHeader icon="🔒" title="อนุมัติ" accent="emerald" /><Card><Empty>สำหรับหัวหน้า/ผู้บริหารเท่านั้น</Empty></Card></Page>;

  return (
    <Page>
      <PageHeader icon="✅" title="รายการรออนุมัติ" accent="emerald"
        subtitle={role === "head" ? "หัวหน้า — อนุมัติได้ทุกอย่าง ยกเว้นแก้เวลาทำงาน/OT (ต้องผู้บริหาร)" : "ผู้บริหาร — อนุมัติได้ทุกอย่าง"} />
      {!isSupabaseReady && <DemoTag />}

      {rows.length === 0 ? <Card><Empty>ไม่มีรายการรออนุมัติ</Empty></Card> : (
        <div className="space-y-3">
          {rows.map((row) => {
            const allowed = canApprove(role, row.request_type);
            return (
              <Card key={row.id}>
                <div className="flex items-center gap-2">
                  <Badge tone={row.request_type.includes("edit") ? "amber" : "sky"}>{TYPE_LABEL[row.request_type] || row.request_type}</Badge>
                  <span className="text-sm font-semibold text-slate-800">{empName(row.employee_id)}</span>
                </div>
                <div className="mt-1 text-sm text-slate-600">{row.detail}</div>
                {AUTO_APPLY_TYPES.has(row.request_type) && (
                  <div className="mt-1 text-xs text-slate-400">* กดอนุมัติแล้วระบบจะแก้ให้อัตโนมัติทันที</div>
                )}
                {errMsg?.id === row.id && <p className="mt-2 text-sm text-rose-500">{errMsg.text}</p>}
                {allowed ? (
                  <div className="mt-3 flex gap-2">
                    <button disabled={busyId === row.id} onClick={() => decide(row, "approved")} className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white active:bg-emerald-700 disabled:bg-slate-300">{busyId === row.id ? "กำลังดำเนินการ…" : "อนุมัติ"}</button>
                    <button disabled={busyId === row.id} onClick={() => decide(row, "rejected")} className="flex-1 rounded-xl bg-white py-2 text-sm font-semibold text-rose-500 ring-1 ring-rose-200">ไม่อนุมัติ</button>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">🔒 หัวหน้าอนุมัติรายการนี้ไม่ได้ — ต้องให้ <b>ผู้บริหาร</b> เป็นผู้อนุมัติ</div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">เพิ่งตัดสิน</h2>
          <div className="divide-y divide-slate-100">
            {done.map((d, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700">{empName(d.employee_id)} · {TYPE_LABEL[d.request_type] || d.request_type}</span>
                <span className={d.status === "approved" ? "text-emerald-600" : "text-rose-500"}>{d.status === "approved" ? "อนุมัติ" : "ไม่อนุมัติ"} โดย {d.approver_name}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Page>
  );
}
