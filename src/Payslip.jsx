import { useState, useEffect, useMemo } from "react";
import { listEmployees, fetchOrg, fetchPeriodPunches, listDeductionsForEmployee } from "./lib/db.js";
import { isSupabaseReady } from "./lib/supabase.js";
import { DEMO_EMPLOYEES, DEMO_ORG, demoPunches, demoDeductions } from "./lib/demo.js";
import { PERIODS, monthRange, dailyFromPunches, summarizeDays, computePayslip, baht, round2 } from "./lib/payroll.js";
import { isManager } from "./lib/rules.js";
import { Page, PageHeader, Card, Select, Field, DemoTag } from "./ui.jsx";

export default function Payslip({ employee }) {
  const manager = isManager(employee?.role);
  const [emps, setEmps] = useState(DEMO_EMPLOYEES);
  const [org, setOrg] = useState(DEMO_ORG);
  const [period, setPeriod] = useState(PERIODS[0]);
  const [empId, setEmpId] = useState(employee?.id || DEMO_EMPLOYEES[2].id);
  const [logs, setLogs] = useState([]);
  const [deducts, setDeducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listEmployees().then((l) => l && l.length && setEmps(l));
    fetchOrg().then((o) => o && setOrg(o));
  }, []);

  const viewId = manager ? empId : employee?.id || empId;
  const emp = emps.find((e) => e.id === viewId) || emps[0];
  const shift = org.shifts.find((s) => s.id === emp?.shift_id) || org.shifts[0];
  const branch = org.branches.find((b) => b.id === emp?.branch_id) || org.branches[0];
  const company = org.companies.find((c) => c.id === emp?.company_id) || org.companies[0];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      if (isSupabaseReady && emp?.id) {
        const { fromISO, toISO } = monthRange(period);
        const [p, d] = await Promise.all([
          fetchPeriodPunches(emp.id, fromISO, toISO),
          listDeductionsForEmployee(emp.id, period.label),
        ]);
        if (alive) { setLogs(p || []); setDeducts(d || []); setLoading(false); }
      } else {
        if (alive) { setLogs(demoPunches(emp, period)); setDeducts(demoDeductions(emp.id, period.label)); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [viewId, period, emp?.id]);

  const att = useMemo(() => {
    const s = summarizeDays(dailyFromPunches(logs, shift));
    return { presentDays: s.presentDays, lateTotal: s.lateTotal, otHours: s.otHours };
  }, [logs, shift]);
  const c = useMemo(() => computePayslip(emp || {}, att, deducts), [emp, att, deducts]);

  const shareLine = () => {
    const text =
      `สลิปเงินเดือน ${period.label}\n${emp.name} (${emp.code})\n` +
      `รายได้รวม ${baht(c.grossEarnings)}\nหักรวม ${baht(c.totalDeductions)}\nสุทธิ ${baht(c.netPay)} บาท`;
    window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <Page>
      <PageHeader icon="🧾" title="สลิปเงินเดือน" accent="emerald" subtitle={`${period.label} · ${emp?.name || ""}`} />
      {!isSupabaseReady && <DemoTag />}

      <Card className="mb-4 no-print">
        <div className="grid grid-cols-2 gap-3">
          <Field label="งวด">
            <Select value={period.label} onChange={(e) => setPeriod(PERIODS.find((p) => p.label === e.target.value))}>
              {PERIODS.map((p) => <option key={p.label}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="พนักงาน">
            <Select value={viewId} onChange={(e) => setEmpId(e.target.value)} disabled={!manager}>
              {(manager ? emps : emps.filter((e) => e.id === employee?.id)).map((e) => (
                <option key={e.id} value={e.id}>{e.name} ({e.code})</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => window.print()} className="flex-1 rounded-xl bg-slate-800 py-2.5 text-sm font-semibold text-white active:bg-slate-700">🖨️ พิมพ์</button>
          <button onClick={shareLine} className="flex-1 rounded-xl bg-[#06C755] py-2.5 text-sm font-semibold text-white">แชร์เข้า LINE</button>
        </div>
      </Card>

      {/* ใบสลิป */}
      <div className="payslip overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-600 px-5 py-4 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-base font-bold">{company?.name}</div>
              <div className="text-xs opacity-80">{branch?.name}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold">สลิปเงินเดือน</div>
              <div className="text-xs opacity-80">{period.label}</div>
            </div>
          </div>
        </div>

        <div className="p-5">
          {loading ? <div className="py-8 text-center text-slate-400">กำลังคำนวณ…</div> : (
            <>
              <div className="grid grid-cols-2 gap-y-1 text-sm sm:grid-cols-3">
                <Info label="ชื่อ" value={emp?.name} />
                <Info label="รหัส" value={emp?.code} />
                <Info label="ตำแหน่ง" value={emp?.position} />
                <Info label="ค่าจ้าง" value={emp?.pay_type === "daily" ? "รายวัน" : "รายเดือน"} />
                <Info label="มาทำงาน" value={`${att.presentDays} วัน`} />
                <Info label="OT" value={`${round2(att.otHours)} ชม.`} />
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1 rounded-t-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">รายได้</div>
                  <Row label={emp?.pay_type === "daily" ? `ค่าจ้าง (${att.presentDays} วัน)` : "เงินเดือน"} value={c.base} />
                  {c.otPay > 0 && <Row label={`ค่าล่วงเวลา (${round2(att.otHours)} ชม.)`} value={c.otPay} />}
                  <Row label="รวมรายได้" value={c.grossEarnings} bold tone="emerald" />
                </div>
                <div>
                  <div className="mb-1 rounded-t-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white">รายการหัก</div>
                  {c.dLate > 0 && <Row label={`หักมาสาย (${c.lateInfo.chargeable} น.)`} value={c.dLate} minus />}
                  {c.sso > 0 && <Row label="ประกันสังคม 5%" value={c.sso} minus />}
                  {c.deducts.map((d, i) => <Row key={i} label={`${d.type}${d.created_by_name ? ` · โดย ${d.created_by_name}` : ""}`} value={d.amount} minus />)}
                  {c.totalDeductions === 0 && <div className="px-3 py-2 text-sm text-slate-400">ไม่มีรายการหัก</div>}
                  <Row label="รวมรายการหัก" value={c.totalDeductions} bold tone="rose" minus />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between rounded-xl bg-slate-900 px-5 py-4 text-white">
                <span className="text-sm font-medium">เงินสุทธิที่ได้รับ</span>
                <span className="text-2xl font-bold tabular-nums">{baht(c.netPay)} ฿</span>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`@media print { .no-print{display:none!important} body{background:#fff!important} @page{size:A4;margin:12mm} }`}</style>
    </Page>
  );
}

function Info({ label, value }) {
  return <div><span className="text-slate-400">{label}: </span><span className="font-medium text-slate-800">{value}</span></div>;
}
function Row({ label, value, bold, minus, tone }) {
  const c = tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : "text-slate-800";
  return (
    <div className={`flex justify-between border-b border-slate-100 px-3 py-1.5 text-sm ${bold ? "bg-slate-50 font-semibold" : ""}`}>
      <span className={bold ? c : "text-slate-600"}>{label}</span>
      <span className={`tabular-nums ${bold ? c : "text-slate-800"}`}>{minus ? "-" : ""}{baht(value)}</span>
    </div>
  );
}
