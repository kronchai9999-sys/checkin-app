import { useState, useEffect, useMemo } from "react";

/**
 * แอปเช็คอินพนักงาน (Standalone PWA) — เช็คอินเข้า/เช็คเอาออก
 * ------------------------------------------------------------------
 * - กดปุ่มเดียวสลับ เช็คอินเข้างาน ↔ เช็คเอาเลิกงาน
 * - ตรวจสอบด้วย GPS อย่างเดียว (ต้องอยู่ในรัศมีร้าน) — ไม่ต้องถ่ายเซลฟี่
 * - เวลาเรียลไทม์ตามนาฬิกาเครื่อง
 * - คำนวณสาย (ตอนเข้างาน) และ OT/ออกก่อนเวลา (ตอนเลิกงาน)
 * - หลายบริษัท / หลายสาขา · กะถูกล็อกจากระบบหลังบ้าน
 *
 * ระบบจริง: insert attendance_logs ทุกครั้งที่เช็ค (type=in/out, ts, lat, lng, distance)
 * แล้วหน้า Timesheet รวมยอด + แก้ไขก่อนปิดงวดคิดเงินเดือน
 */

const COMPANIES = [
  {
    id: "bakery",
    name: "ร้านเบเกอรี่บรรจุภัณฑ์",
    branches: [
      { id: "b1", name: "สาขาหนองคาย", lat: 17.8782, lng: 102.742, radius: 150 },
      { id: "b2", name: "สาขาอุดรธานี", lat: 17.4138, lng: 102.787, radius: 150 },
    ],
    shifts: [
      { id: "morning", name: "กะเช้า", start: "07:00", end: "16:00" },
      { id: "afternoon", name: "กะบ่าย", start: "13:00", end: "22:00" },
      { id: "night", name: "กะดึก", start: "22:00", end: "06:00" },
    ],
  },
  {
    id: "jimart",
    name: "jimart ค้าส่ง",
    branches: [{ id: "j01", name: "คลังกลาง อุดรธานี", lat: 17.4, lng: 102.8, radius: 200 }],
    shifts: [{ id: "day", name: "กะปกติ", start: "08:00", end: "17:00" }],
  },
];

// ล็อกกะจากระบบหลังบ้าน: true = พนักงานเปลี่ยนกะเองไม่ได้ (กะถูกกำหนดมาจากแอดมิน)
const LOCK_SHIFT = true;

// ลำดับการเช็ค 2 ครั้ง/วัน
const PUNCHES = [
  { key: "in", label: "เช็คอินเข้างาน", short: "เข้างาน", compare: "in" },
  { key: "out", label: "เช็คเอาเลิกงาน", short: "เลิกงาน", compare: "out" },
];

function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function shiftStatus(date, shift, compare) {
  if (!compare) return null;
  const nowMin = date.getHours() * 60 + date.getMinutes();
  const target = compare === "in" ? toMin(shift.start) : toMin(shift.end);
  let diff = nowMin - target;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  if (compare === "in") {
    if (diff > 0) return { tone: "bad", label: `สายไป ${diff} นาที` };
    if (diff === 0) return { tone: "ok", label: "ตรงเวลา" };
    return { tone: "ok", label: `ก่อนเวลา ${-diff} นาที` };
  } else {
    if (diff > 0) return { tone: "ot", label: `OT ${diff} นาที` };
    if (diff === 0) return { tone: "ok", label: "ตรงเวลา" };
    return { tone: "bad", label: `ก่อนเวลา ${-diff} นาที` };
  }
}

const TH = { fontFamily: '"Sarabun","Noto Sans Thai","Prompt",sans-serif' };

export default function CheckIn() {
  const [companyId, setCompanyId] = useState("bakery");
  const [branchId, setBranchId] = useState("b1");
  const [shiftId, setShiftId] = useState("morning");
  const employeeName = "สมหญิง ใจดี";

  const company = COMPANIES.find((c) => c.id === companyId);
  const branch = company.branches.find((b) => b.id === branchId);
  const shift = company.shifts.find((s) => s.id === shiftId) || company.shifts[0];

  const [now, setNow] = useState(new Date());
  const [done, setDone] = useState([]);            // records ที่เช็คแล้ววันนี้ [in, out]
  const [coords, setCoords] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const idx = done.length;                         // ครั้งต่อไป (0=เข้า, 1=เลิก)
  const current = PUNCHES[idx] || null;
  const dayComplete = idx >= PUNCHES.length;

  const distance = useMemo(
    () => (coords ? distanceMeters(coords, branch) : null),
    [coords, branch]
  );
  const inRange = distance != null && distance <= branch.radius;
  const ready = inRange && !dayComplete;

  function getLocation() {
    setGpsError(null);
    setGpsLoading(true);
    if (!navigator.geolocation) {
      // โหมดสาธิต (preview ไม่มี GPS) — จำลองพิกัดในรัศมีร้าน
      setCoords({ lat: branch.lat + 0.0003, lng: branch.lng + 0.0002 });
      setGpsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      () => {
        setGpsError("อ่านพิกัดไม่ได้ — ใช้โหมดสาธิต");
        setCoords({ lat: branch.lat + 0.0003, lng: branch.lng + 0.0002 });
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function doPunch() {
    if (!ready) return;
    const t = new Date();
    const rec = {
      key: current.key,
      label: current.short,
      time: t,
      timeStr: t.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      coords,
      distance,
      status: shiftStatus(t, shift, current.compare),
    };
    setDone([...done, rec]);
    setCoords(null); setGpsError(null);   // เคลียร์ GPS ให้เช็คใหม่ครั้งถัดไป
    // ระบบจริง: insert attendance_logs (type=current.key, ts, lat, lng, distance)
  }

  function resetDay() {
    setDone([]); setCoords(null); setGpsError(null);
  }
  function changeCompany(id) {
    const c = COMPANIES.find((x) => x.id === id);
    setCompanyId(c.id); setBranchId(c.branches[0].id); setShiftId(c.shifts[0].id); resetDay();
  }

  const timeStr = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const recIn = done[0];
  const recOut = done[1];
  const statusText = dayComplete ? "เลิกงานแล้ว" : recIn ? "กำลังทำงาน" : "ยังไม่เข้า";
  const isOut = current && current.compare === "out";   // ปุ่มเช็คเอา = สีฟ้า
  const accent = isOut ? "sky" : "emerald";

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-100 p-4" style={TH}>
      <div className="w-full max-w-sm space-y-3">
        {/* Header card */}
        <div className={`overflow-hidden rounded-3xl text-white shadow-xl bg-gradient-to-br ${isOut ? "from-sky-600 to-sky-500" : "from-emerald-600 to-emerald-500"}`}>
          <div className="px-5 pb-5 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs opacity-80">{company.name}</div>
                <div className="text-sm font-semibold">สวัสดี, {employeeName}</div>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-xs opacity-90">{dateStr}</div>
              <div className="text-5xl font-bold tabular-nums tracking-wide">{timeStr}</div>
              <div className="mt-2 inline-block rounded-full bg-white/20 px-3 py-1 text-xs">
                🔒 {shift.name} · {shift.start}–{shift.end} น.
              </div>
            </div>
          </div>
          {/* สรุป เข้า/เลิก/สถานะ */}
          <div className="grid grid-cols-3 divide-x divide-white/20 border-t border-white/20 bg-white/10 text-center">
            <SummaryCell label="เข้างาน" value={recIn ? recIn.timeStr : "—"} sub={recIn?.status?.label} />
            <SummaryCell label="เลิกงาน" value={recOut ? recOut.timeStr : "—"} sub={recOut?.status?.label} />
            <SummaryCell label="สถานะ" value={statusText} strong />
          </div>
        </div>

        {/* สาขา (กะถูกล็อก) */}
        <div className="space-y-2 rounded-2xl bg-white p-3 shadow-sm">
          <div className="flex gap-2">
            <select value={companyId} onChange={(e) => changeCompany(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
              {COMPANIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); resetDay(); }}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
              {company.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {LOCK_SHIFT ? (
            <div className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
              <span>กะ: {shift.name} ({shift.start}–{shift.end} น.)</span>
              <span className="text-xs text-slate-400">🔒 ล็อกจากระบบ</span>
            </div>
          ) : (
            <select value={shiftId} onChange={(e) => { setShiftId(e.target.value); resetDay(); }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
              {company.shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start}–{s.end} น.)</option>)}
            </select>
          )}
        </div>

        {/* ปุ่มตรวจ GPS + ปุ่มเช็คอินวงกลม */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          {dayComplete ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
              <div className="text-lg font-bold text-slate-900">บันทึกเวลาครบแล้ววันนี้</div>
              <div className="mt-1 text-sm text-slate-500">เข้า {recIn?.timeStr} · เลิก {recOut?.timeStr}</div>
              <button onClick={resetDay} className="mt-4 text-sm text-emerald-600 underline">ทดสอบใหม่</button>
            </div>
          ) : (
            <>
              {/* แถบสถานะ GPS */}
              <button onClick={getLocation} disabled={gpsLoading}
                className="mx-auto mb-4 flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
                📍 {gpsLoading ? "กำลังตรวจ GPS…" : "ตรวจ GPS"}
              </button>

              {coords && (
                <div className={`mb-4 rounded-xl p-3 text-sm ${inRange ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{inRange ? "✓ อยู่ในพื้นที่ร้าน" : "✗ อยู่นอกพื้นที่ร้าน"}</span>
                    <span className="tabular-nums">ห่าง {distance} ม.</span>
                  </div>
                  <div className="mt-1 text-xs opacity-70">อนุญาตในรัศมี {branch.radius} ม. จาก {branch.name}</div>
                </div>
              )}
              {gpsError && <p className="mb-3 text-center text-xs text-rose-500">{gpsError}</p>}

              {/* ปุ่มวงกลมใหญ่ */}
              <button onClick={doPunch} disabled={!ready}
                className={`mx-auto flex aspect-square w-56 flex-col items-center justify-center rounded-full text-center transition ${
                  ready
                    ? isOut
                      ? "bg-sky-500 text-white shadow-xl shadow-sky-200 active:scale-95"
                      : "bg-emerald-500 text-white shadow-xl shadow-emerald-200 active:scale-95"
                    : "cursor-not-allowed bg-slate-100 text-slate-400"
                }`}>
                <span className="text-4xl">{isOut ? "🏁" : "➜]"}</span>
                <span className="mt-2 text-xl font-bold">{current.label}</span>
              </button>

              <p className="mt-4 text-center text-sm text-slate-400">
                {ready ? "แตะปุ่มเพื่อบันทึกเวลา" : "กด \"ตรวจ GPS\" ให้อยู่ในพื้นที่ร้านก่อน"}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCell({ label, value, sub, strong }) {
  return (
    <div className="px-2 py-3">
      <div className="text-xs opacity-80">{label}</div>
      <div className={`tabular-nums ${strong ? "text-base font-bold" : "text-lg font-semibold"}`}>{value}</div>
      {sub && <div className="text-[10px] opacity-80">{sub}</div>}
    </div>
  );
}
