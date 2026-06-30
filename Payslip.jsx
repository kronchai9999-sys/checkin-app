import { useState, useMemo } from "react";

/**
 * สลิปเงินเดือน — ซุปเปอร์ถูก gmart
 * ------------------------------------------------------------------
 * Prototype สำหรับวางลงระบบ HR/Payroll (React + Supabase + Vercel)
 *
 * จุดสำคัญที่ demo ในไฟล์นี้:
 *  - รายการหักครบ: ขาด / ลา / มาสาย / เบิกล่วงหน้า / เงินกู้ /
 *    เงินขาด(แคชเชียร์) / ค่าสินค้าเสียหาย / ประกันสังคม
 *  - "บัญชีหนี้" เบิกล่วงหน้า + เงินกู้ ที่หักไม่หมด -> ยอดติดลบ
 *    ทบไปเดือนถัดไป (ยอดยกมา / หักงวดนี้ / ยอดคงเหลือยกไป)
 *  - ปุ่มพิมพ์สลิป + ปุ่มแชร์เข้า LINE
 *
 * การคำนวณทั้งหมดอิงจาก field ที่ "ดิบ" ที่สุด (ค่าจ้าง, จำนวนวัน,
 * จำนวนนาที, ยอดหนี้) เพื่อให้ย้ายไปทำใน Supabase RPC ได้ตรงๆ
 */

// ---------- ค่าคงที่/กติกาการคำนวณ (แก้ได้ที่นี่ที่เดียว) ----------
const RULES = {
  workDaysPerMonth: 26,         // ฐานหารค่าจ้าง/วัน สำหรับพนักงานเงินเดือน
  lateGraceMinutesPerMonth: 10, // ผ่อนผันสายสะสม "ทั้งเดือน" (นาที) — ไม่หัก
  lateRatePerMinute: 5,         // ส่วนที่เกินผ่อนผัน หักนาทีละ (บาท)
  otRatePerHour: 25,            // OT บาท/ชม.
  ssoRate: 0.05,               // ประกันสังคม 5%
  ssoCapBase: 15000,           // เพดานฐานคำนวณ สปส.
  maxLoanDeductPerMonth: 3000, // หักเงินกู้/เบิกล่วงหน้า สูงสุดต่อเดือน
};

// ---------- ข้อมูลตัวอย่าง (ในระบบจริงดึงจาก Supabase) ----------
const SAMPLE = {
  emp001: {
    code: "EMP-001",
    name: "สมหญิง ใจดี",
    position: "พนักงานขาย",
    branch: "สาขา 03 หนองคาย",
    payType: "monthly",        // monthly | daily
    baseSalary: 13000,         // เงินเดือน (ถ้า daily คือค่าจ้าง/วัน)
    startDate: "01/03/2566",
    period: "มิถุนายน 2569",
    earnings: { ot: 1, otRate: 80, diligence: 500, commission: 1200, allowance: 0 },
    // OT ชั่วโมง, อัตรา OT/ชม., เบี้ยขยัน, คอมมิชชั่น, ค่าตำแหน่ง
    attendance: { worked: 25, lateCount: 1, lateMinutes: 20, absentDays: 0, leaveUnpaid: 0, leaveSick: 1, leavePersonal: 0, leaveVacation: 0 },
    deductionsRaw: { cashShort: 0, goodsDamage: 0, withholdingTax: 0 },
    loanLedger: { openingBalance: 0, requestedThisMonth: 0 }, // ยอดหนี้ยกมา + เบิกเพิ่มเดือนนี้
  },
  emp002: {
    code: "EMP-014",
    name: "ประยุทธ์ ขยันงาน",
    position: "แคชเชียร์",
    branch: "สาขา 07 อุดรธานี",
    payType: "monthly",
    baseSalary: 11000,
    startDate: "15/08/2567",
    period: "มิถุนายน 2569",
    earnings: { ot: 0, otRate: 75, diligence: 0, commission: 0, allowance: 0 },
    attendance: { worked: 22, lateCount: 4, lateMinutes: 95, absentDays: 2, leaveUnpaid: 1, leaveSick: 0, leavePersonal: 1, leaveVacation: 0 },
    deductionsRaw: { cashShort: 850, goodsDamage: 1200, withholdingTax: 0 },
    loanLedger: { openingBalance: 8000, requestedThisMonth: 5000 }, // หนี้เก่า 8,000 + เพิ่งเบิกอีก 5,000
  },
};

const baht = (n) =>
  (Math.round(n * 100) / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ---------- เครื่องคำนวณเงินเดือน (logic เดียวกับที่จะย้ายไป Supabase) ----------
function calcPayroll(e) {
  const dailyWage =
    e.payType === "daily" ? e.baseSalary : e.baseSalary / RULES.workDaysPerMonth;

  // รายได้
  const base = e.payType === "daily" ? e.baseSalary * e.attendance.worked : e.baseSalary;
  const ot = e.earnings.ot * RULES.otRatePerHour;
  const grossEarnings =
    base + ot + e.earnings.diligence + e.earnings.commission + e.earnings.allowance;

  // รายการหักจากการลงเวลา
  const dAbsent = dailyWage * e.attendance.absentDays;
  const dLeaveUnpaid = dailyWage * e.attendance.leaveUnpaid;
  // สายสะสมทั้งเดือน: ผ่อนผัน 10 นาทีแรกฟรี ส่วนที่เกินหักนาทีละ 5 บาท
  const lateChargeable = Math.max(0, e.attendance.lateMinutes - RULES.lateGraceMinutesPerMonth);
  const dLate = lateChargeable * RULES.lateRatePerMinute;

  // ประกันสังคม
  const sso = Math.min(base, RULES.ssoCapBase) * RULES.ssoRate;

  // รายการหักอื่น (ความเสียหาย/ภาษี)
  const dCashShort = e.deductionsRaw.cashShort;
  const dGoodsDamage = e.deductionsRaw.goodsDamage;
  const dTax = e.deductionsRaw.withholdingTax;

  // เงินสุทธิ "ก่อนหัก" เงินกู้/เบิกล่วงหน้า
  const beforeLoan =
    grossEarnings - dAbsent - dLeaveUnpaid - dLate - sso - dCashShort - dGoodsDamage - dTax;

  // ----- บัญชีหนี้: เบิกล่วงหน้า + เงินกู้ -----
  const loanBalance = e.loanLedger.openingBalance + e.loanLedger.requestedThisMonth;
  // หักได้เท่าที่ไม่ทำให้ติดลบ และไม่เกินเพดานต่อเดือน
  const loanDeducted = Math.max(
    0,
    Math.min(loanBalance, RULES.maxLoanDeductPerMonth, beforeLoan)
  );
  const loanCarryForward = loanBalance - loanDeducted; // ยอดติดลบ/คงเหลือ ทบไปเดือนหน้า

  const netPay = beforeLoan - loanDeducted;

  return {
    dailyWage,
    grossEarnings,
    earnings: { base, ot, diligence: e.earnings.diligence, commission: e.earnings.commission, allowance: e.earnings.allowance },
    deductions: { dAbsent, dLeaveUnpaid, dLate, sso, dCashShort, dGoodsDamage, dTax },
    lateInfo: { total: e.attendance.lateMinutes, grace: RULES.lateGraceMinutesPerMonth, chargeable: lateChargeable },
    loan: { balance: loanBalance, deducted: loanDeducted, carryForward: loanCarryForward, opening: e.loanLedger.openingBalance, requested: e.loanLedger.requestedThisMonth },
    totalDeductions: dAbsent + dLeaveUnpaid + dLate + sso + dCashShort + dGoodsDamage + dTax + loanDeducted,
    netPay,
  };
}

export default function Payslip() {
  const [selected, setSelected] = useState("emp002");
  const e = SAMPLE[selected];
  const c = useMemo(() => calcPayroll(e), [selected]);

  const handlePrint = () => window.print();

  const handleLineShare = () => {
    // Prototype: เปิด LINE share พร้อมสรุปยอด
    // ระบบจริง: ควรสร้าง LIFF link / รูปสลิป (PDF/PNG) ที่ปลอดภัยแล้วแชร์ลิงก์แทน
    const text =
      `สลิปเงินเดือน ${e.period}\n` +
      `${e.name} (${e.code})\n` +
      `${e.branch}\n` +
      `รายได้รวม ${baht(c.grossEarnings)} บาท\n` +
      `หักรวม ${baht(c.totalDeductions)} บาท\n` +
      `เงินสุทธิ ${baht(c.netPay)} บาท` +
      (c.loan.carryForward > 0 ? `\nยอดหนี้ยกไปเดือนหน้า ${baht(c.loan.carryForward)} บาท` : "");
    const url = `https://line.me/R/share?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const TH = { fontFamily: '"Sarabun","Noto Sans Thai","Prompt",sans-serif' };

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8" style={TH}>
      {/* แถบควบคุม (ไม่พิมพ์) */}
      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">ดูตัวอย่าง:</span>
          <button
            onClick={() => setSelected("emp001")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${selected === "emp001" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            พนักงานปกติ
          </button>
          <button
            onClick={() => setSelected("emp002")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${selected === "emp002" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            กรณีติดลบ → ทบเดือนหน้า
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            🖨️ พิมพ์สลิป
          </button>
          <button onClick={handleLineShare} className="rounded-lg bg-[#06C755] px-4 py-2 text-sm font-semibold text-white hover:brightness-95">
            แชร์เข้า LINE
          </button>
        </div>
      </div>

      {/* ใบสลิป */}
      <div className="payslip mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-lg sm:p-10">
        {/* หัวสลิป */}
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div>
            <div className="text-xl font-bold text-slate-900">ซุปเปอร์ถูก gmart</div>
            <div className="text-sm text-slate-500">{e.branch}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-slate-900">สลิปเงินเดือน</div>
            <div className="text-sm text-slate-500">งวดประจำเดือน {e.period}</div>
          </div>
        </div>

        {/* ข้อมูลพนักงาน */}
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <Info label="ชื่อ-สกุล" value={e.name} />
          <Info label="รหัสพนักงาน" value={e.code} />
          <Info label="ตำแหน่ง" value={e.position} />
          <Info label="ประเภทค่าจ้าง" value={e.payType === "monthly" ? "รายเดือน" : "รายวัน"} />
          <Info label="วันเริ่มงาน" value={e.startDate} />
          <Info label="วันทำงาน" value={`${e.attendance.worked} วัน`} />
        </div>

        {/* สรุปการลงเวลา */}
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center text-xs sm:grid-cols-6">
          <Stat label="มาสาย" value={`${e.attendance.lateCount} ครั้ง`} sub={`${e.attendance.lateMinutes} นาที`} />
          <Stat label="ขาดงาน" value={`${e.attendance.absentDays} วัน`} />
          <Stat label="ลาป่วย" value={`${e.attendance.leaveSick} วัน`} />
          <Stat label="ลากิจ" value={`${e.attendance.leavePersonal} วัน`} />
          <Stat label="ลาไม่รับค่าจ้าง" value={`${e.attendance.leaveUnpaid} วัน`} />
          <Stat label="OT" value={`${e.earnings.ot} ชม.`} />
        </div>

        {/* รายได้ / รายการหัก */}
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* รายได้ */}
          <div>
            <div className="mb-1 rounded-t-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">รายได้</div>
            <Row label={e.payType === "daily" ? `ค่าจ้าง (${e.attendance.worked} วัน)` : "เงินเดือน"} value={c.earnings.base} />
            {c.earnings.ot > 0 && <Row label={`ค่าล่วงเวลา (${e.earnings.ot} ชม. × 25)`} value={c.earnings.ot} />}
            {c.earnings.diligence > 0 && <Row label="เบี้ยขยัน" value={c.earnings.diligence} />}
            {c.earnings.commission > 0 && <Row label="ค่าคอมมิชชั่น" value={c.earnings.commission} />}
            {c.earnings.allowance > 0 && <Row label="ค่าตำแหน่ง/เบี้ยเลี้ยง" value={c.earnings.allowance} />}
            <Row label="รวมรายได้" value={c.grossEarnings} bold accent="emerald" />
          </div>

          {/* รายการหัก */}
          <div>
            <div className="mb-1 rounded-t-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white">รายการหัก</div>
            {c.deductions.dAbsent > 0 && <Row label={`หักขาดงาน (${e.attendance.absentDays} วัน)`} value={c.deductions.dAbsent} minus />}
            {c.deductions.dLeaveUnpaid > 0 && <Row label="หักลาไม่รับค่าจ้าง" value={c.deductions.dLeaveUnpaid} minus />}
            {c.deductions.dLate > 0 && <Row label={`หักมาสาย (สายรวม ${c.lateInfo.total} น. − ผ่อนผัน ${c.lateInfo.grace} = ${c.lateInfo.chargeable} น. × 5)`} value={c.deductions.dLate} minus />}
            {c.deductions.sso > 0 && <Row label="ประกันสังคม 5%" value={c.deductions.sso} minus />}
            {c.deductions.dCashShort > 0 && <Row label="หักเงินขาด (แคชเชียร์)" value={c.deductions.dCashShort} minus />}
            {c.deductions.dGoodsDamage > 0 && <Row label="หักค่าสินค้าเสียหาย" value={c.deductions.dGoodsDamage} minus />}
            {c.deductions.dTax > 0 && <Row label="ภาษีหัก ณ ที่จ่าย" value={c.deductions.dTax} minus />}
            {c.loan.deducted > 0 && <Row label="หักเงินกู้/เบิกล่วงหน้า" value={c.loan.deducted} minus />}
            <Row label="รวมรายการหัก" value={c.totalDeductions} bold accent="rose" minus />
          </div>
        </div>

        {/* บัญชีเงินกู้/เบิกล่วงหน้า — ยอดทบเดือนถัดไป */}
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="mb-2 text-sm font-semibold text-amber-800">บัญชีเงินกู้ / เบิกล่วงหน้า</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <Ledger label="ยอดยกมา" value={c.loan.opening} />
            <Ledger label="เบิกเพิ่มเดือนนี้" value={c.loan.requested} />
            <Ledger label="หักงวดนี้" value={c.loan.deducted} minus />
            <Ledger
              label="ยอดคงเหลือยกไปเดือนหน้า"
              value={c.loan.carryForward}
              highlight={c.loan.carryForward > 0}
            />
          </div>
          {c.loan.carryForward > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              * หักได้ไม่เต็มจำนวน (เพดาน {baht(RULES.maxLoanDeductPerMonth)} บาท/เดือน หรือเงินสุทธิไม่พอ) —
              ยอดคงเหลือ {baht(c.loan.carryForward)} บาท ทบไปหักในเดือนถัดไปอัตโนมัติ
            </p>
          )}
        </div>

        {/* เงินสุทธิ */}
        <div className="mt-5 flex items-center justify-between rounded-lg bg-slate-900 px-5 py-4 text-white">
          <span className="text-base font-medium">เงินสุทธิที่ได้รับ</span>
          <span className="text-2xl font-bold">{baht(c.netPay)} บาท</span>
        </div>

        {/* ลายเซ็น */}
        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-sm text-slate-500">
          <div>
            <div className="mx-auto mb-1 w-40 border-b border-slate-400" />
            ผู้รับเงิน
          </div>
          <div>
            <div className="mx-auto mb-1 w-40 border-b border-slate-400" />
            ผู้จ่ายเงิน / ฝ่ายบุคคล
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] text-slate-400">
          เอกสารนี้ออกโดยระบบ HR ซุปเปอร์ถูก gmart — โปรดเก็บไว้เป็นหลักฐาน
        </p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .payslip { box-shadow: none !important; max-width: 100% !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <span className="text-slate-400">{label}: </span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <div className="text-slate-400">{label}</div>
      <div className="font-semibold text-slate-800">{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

function Row({ label, value, bold, minus, accent }) {
  const color =
    accent === "emerald" ? "text-emerald-700" : accent === "rose" ? "text-rose-700" : "text-slate-800";
  return (
    <div className={`flex justify-between border-b border-slate-100 px-3 py-1.5 text-sm ${bold ? "bg-slate-50 font-semibold" : ""}`}>
      <span className={bold ? color : "text-slate-600"}>{label}</span>
      <span className={`tabular-nums ${bold ? color : "text-slate-800"}`}>
        {minus ? "-" : ""}{baht(value)}
      </span>
    </div>
  );
}

function Ledger({ label, value, minus, highlight }) {
  return (
    <div>
      <div className="text-xs text-amber-700">{label}</div>
      <div className={`tabular-nums font-semibold ${highlight ? "text-rose-600" : "text-amber-900"}`}>
        {minus ? "-" : ""}{baht(value)}
      </div>
    </div>
  );
}
