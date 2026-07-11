import { useState, useEffect } from "react";
import { listEmployees, fetchOrg, setEmployeeShift } from "../lib/db.js";
import { isSupabaseReady } from "../lib/supabase.js";
import { DEMO_EMPLOYEES, DEMO_ORG } from "../lib/demo.js";
import { canSetShift, isBackOffice, ROLE_LABEL } from "../lib/rules.js";
import { Page, PageHeader, Card, Badge, Empty, DemoTag } from "../ui.jsx";

export default function Shifts({ employee }) {
  const allowed = canSetShift(employee?.role);
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
    setTimeout(() => setSaved((s) => (s === emp.id ? null : s)), 1500);
  }

  if (!allowed) return <Page><PageHeader icon="🔒" title="กำหนดกะ" accent="sky" /><Card><Empty>กำหนด/เปลี่ยนกะ ทำได้เฉพาะหัวหน้ากับผู้บริหาร</Empty></Card></Page>;

  return (
    <Page>
      <PageHeader icon="🔁" title="กำหนดกะพนักงาน" accent="sky" subtitle="เฉพาะหัวหน้า/ผู้บริหาร · พนักงานหลังร้านกะถูกล็อกจากระบบ" />
      {!isSupabaseReady && <DemoTag />}

      <Card className="!p-0">
        {emps.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 border-b border-slate-50 px-4 py-3 last:border-0">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-800">{e.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                <span>{e.code}</span>
                <Badge tone={e.role === "exec" ? "amber" : e.role === "head" ? "sky" : "slate"}>{ROLE_LABEL[e.role]}</Badge>
                {isBackOffice(e) && <Badge tone="rose">หลังร้าน 🔒</Badge>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <select value={e.shift_id || ""} disabled={saving === e.id} onChange={(ev) => change(e, ev.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm outline-none focus:border-emerald-500">
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
              </select>
              {saved === e.id && <span className="text-xs text-emerald-600">✓</span>}
            </div>
          </div>
        ))}
      </Card>
      <p className="mt-3 px-1 text-xs text-slate-400">* ล็อกกะหลังร้าน = พนักงานหลังร้านเปลี่ยนกะเองในแอปไม่ได้ ตั้งได้จากหน้านี้เท่านั้น</p>
    </Page>
  );
}
