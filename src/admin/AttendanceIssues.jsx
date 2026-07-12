import { useState, useEffect, useMemo } from "react";
import { listEmployees, fetchOrg, fetchPeriodPunches, listWaiversRange, setWaiver, removeWaiver } from "../lib/db.js";
import { isSupabaseReady } from "../lib/supabase.js";
import { DEMO_EMPLOYEES, DEMO_ORG, demoPunches } from "../lib/demo.js";
import { PERIODS, monthRange, buildCalendar } from "../lib/payroll.js";
import { canViewAttendanceIssues } from "../lib/rules.js";
import { Page, PageHeader, Card, Select, Field, Badge, Empty, DemoTag } from "../ui.jsx";

export default function AttendanceIssues({ employee }) {
  const allowed = canViewAttendanceIssues(employee?.role);
  const [emps, setEmps] = useState(DEMO_EMPLOYEES);
  const [shifts, setShifts] = useState(DEMO_ORG.shifts);
  const [period, setPeriod] = useState(PERIODS[0]);
  const [issues, setIssues] = useState([]);   // [{employeeId, employeeName, dateKey, dateLabel, type, lateMin, waivedKind}]
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);

  useEffect(() => {
    listEmployees().then((l) => l && l.length && setEmps(l));
    fetchOrg().then((o) => o && setShifts(o.shifts));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const activeEmps = emps.filter((e) => e.active !== false);
      const fromDate = `${period.year}-${String(period.month).padStart(2, "0")}-01`;
      const toDate = `${period.year}-${String(period.month).padStart(2, "0")}-31`;

      let waivers = [];
      if (isSupabaseReady) waivers = await listWaiversRange(fromDate, toDate);
      const wMap = new Map(waivers.map((w) => [`${w.employee_id}__${w.waive_date}`, w.kind]));

      const results = [];
      for (const emp of activeEmps) {
        const shift = shifts.find((s) => s.id === emp.shift_id) || shifts[0];
        let logs;
        if (isSupabaseReady) {
          const { fromISO, toISO } = monthRange(period);
          logs = await fetchPeriodPunches(emp.id, fromISO, toISO);
        } else {
          logs = demoPunches(emp, period);
        }
        const days = buildCalendar(logs || [], shift, emp.off_days, period);
        for (const d of days) {
          if (d.isOff) continue;
          if (d.absent) {
            results.push({ employeeId: emp.id, employeeName: emp.name, dateKey: d.dateKey, dateLabel: d.dateLabel, type: "absent", waivedKind: wMap.get(`${emp.id}__${d.dateKey}`) });
          } else if (d.lateMin > 0) {
            results.push({ employeeId: emp.id, employeeName: emp.name, dateKey: d.dateKey, dateLabel: d.dateLabel, type: "late", lateMin: d.lateMin, waivedKind: wMap.get(`${emp.id}__${d.dateKey}`) });
          }
        }
      }
      results.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
      if (alive) { setIssues(results); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [emps, shifts, period]);

  async function toggleWaive(issue) {
    const key = issue.employeeId + issue.dateKey;
    setBusyKey(key);
    const isWaived = Boolean(issue.waivedKind);
    const res = isWaived
      ? await removeWaiver(issue.employeeId, issue.dateKey)
      : await setWaiver({ employeeId: issue.employeeId, dateKey: issue.dateKey, kind: issue.type, createdBy: employee?.id, createdByName: employee?.name });
    setBusyKey(null);
    if (res?.error) return;
    setIssues((list) => list.map((i) => (i.employeeId === issue.employeeId && i.dateKey === issue.dateKey ? { ...i, waivedKind: isWaived ? undefined : issue.type } : i)));
  }

  const stats = useMemo(() => {
    const late = issues.filter((i) => i.type === "late");
    const absent = issues.filter((i) => i.type === "absent");
    const waived = issues.filter((i) => i.waivedKind).length;
    return { late: late.length, absent: absent.length, waived };
  }, [issues]);

  if (!allowed) return <Page><PageHeader icon="🔒" title="พนักงานขาด-สาย" accent="rose" /><Card><Empty>เฉพาะผู้บริหารเท่านั้น</Empty></Card></Page>;

  return (
    <Page>
      <PageHeader icon="🚨" title="พนักงานขาด-สาย" accent="rose" subtitle="ภาพรวมทั้งบริษัท · กดไม่หักเงินเป็นรายวันได้ (มีผลในสลิปทันที)" />
      {!isSupabaseReady && <DemoTag />}

      <Card className="mb-4">
        <Field label="งวด">
          <Select value={period.label} onChange={(e) => setPeriod(PERIODS.find((p) => p.label === e.target.value))}>
            {PERIODS.map((p) => <option key={p.label}>{p.label}</option>)}
          </Select>
        </Field>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-xl bg-rose-50 py-2"><div className="text-lg font-bold text-rose-600">{stats.absent}</div><div className="text-xs text-slate-500">ขาดงาน</div></div>
          <div className="rounded-xl bg-amber-50 py-2"><div className="text-lg font-bold text-amber-600">{stats.late}</div><div className="text-xs text-slate-500">มาสาย</div></div>
          <div className="rounded-xl bg-emerald-50 py-2"><div className="text-lg font-bold text-emerald-600">{stats.waived}</div><div className="text-xs text-slate-500">ไม่หักแล้ว</div></div>
        </div>
      </Card>

      <Card className="!p-0">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">รายการ ({issues.length})</div>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">กำลังโหลด…</div>
        ) : issues.length === 0 ? (
          <Empty>ไม่พบขาด/สายในงวดนี้ 🎉</Empty>
        ) : (
          <div className="divide-y divide-slate-50">
            {issues.map((i) => {
              const key = i.employeeId + i.dateKey;
              const waived = Boolean(i.waivedKind);
              return (
                <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={i.type === "absent" ? "rose" : "amber"}>{i.type === "absent" ? "ขาดงาน" : `สาย ${i.lateMin} น.`}</Badge>
                      <span className="truncate text-sm font-medium text-slate-800">{i.employeeName}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">{i.dateLabel}</div>
                  </div>
                  <button onClick={() => toggleWaive(i)} disabled={busyKey === key}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${
                      waived ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                    }`}>
                    {busyKey === key ? "…" : waived ? "✓ ไม่หักแล้ว (ยกเลิก)" : "ไม่หักเงิน"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <p className="mt-3 px-1 text-xs text-slate-400">* กด "ไม่หักเงิน" แล้วสลิปของพนักงานคนนั้นจะไม่หักค่าสาย/ขาดของวันนี้อัตโนมัติ · กดซ้ำเพื่อยกเลิก</p>
    </Page>
  );
}
