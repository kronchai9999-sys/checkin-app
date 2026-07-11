import { useState, useEffect } from "react";
import { listEmployees, fetchOrg, setEmployeeShift } from "../lib/db.js";
import { DEMO_EMPLOYEES, DEMO_ORG } from "../lib/demo.js";
import { canSetShift, isBackOffice, ROLE_LABEL } from "../lib/rules.js";
import { Blocked } from "./Deductions.jsx";

const TH = { fontFamily: '"Sarabun","Noto Sans Thai","Prompt",sans-serif' };

export default function Shifts({ employee }) {
  const allowed = canSetShift(employee?.role);   // req 6: หัวหน้า/ผู้บริหารเท่านั้น
  const [emps, setEmps] = useState(DEMO_EMPLOYEES);
  const [shifts, setShifts] = useState(DEMO_ORG.shifts);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    listEmployees().then((l) => l && l.length && setEmps(l));
    fetchOrg().then((o) => o && setShifts(o.shifts));
  }, []);

  async function change(emp, shiftId) {
    setSaving(emp.id);
    const res = await setEmployeeShift(emp.id, shiftId);
    setSaving(null);
    if (res?.error) return;
    setEmps((list) => list.map((e) => (e.id === emp.id ? { ...e, shift_id: shiftId } : e)));
    setSaved(emp.id);
    setTimeout(() => setSaved(null), 1500);
  }

  if (!allowed) return <Blocked text="กำหนด/เปลี่ยนกะ ทำได้เฉพาะหัวหน้ากับผู้บริหาร" />;

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6" style={TH}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">กำหนดกะพนักงาน</h1>
          <p className="text-sm text-slate-500">
            เฉพาะหัวหน้า/ผู้บริหารกำหนดได้ · พนักงาน<b>หลังร้าน</b>กะถูกล็อกจากระบบ (พนักงานเปลี่ยนเองไม่ได้)
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {emps.map((e) => {
            const locked = isBackOffice(e);
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
                <div>
                  <div className="text-sm font-medium text-slate-800">{e.name}</div>
                  <div className="text-xs text-slate-400">
                    {e.code} · {ROLE_LABEL[e.role]} · {e.department === "back" ? "หลังร้าน 🔒" : "หน้าร้าน"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select value={e.shift_id || ""} disabled={saving === e.id}
                    onChange={(ev) => change(e, ev.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
                    {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
                  </select>
                  {saved === e.id && <span className="text-xs text-emerald-600">บันทึกแล้ว</span>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="px-1 text-xs text-slate-400">
          * “ล็อกกะหลังร้าน” = ฝั่งพนักงานหลังร้านเปลี่ยนกะเองในแอปไม่ได้ (ตั้งได้จากหน้านี้เท่านั้น) — ตามที่กำหนด
        </p>
      </div>
    </div>
  );
}
