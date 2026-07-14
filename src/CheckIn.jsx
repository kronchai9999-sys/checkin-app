import { useState, useEffect, useMemo } from "react";
import { fetchCompanies, savePunch, fetchTodayPunches } from "./lib/db.js";
import { enqueuePunch, flushQueue, getQueue } from "./lib/offline.js";

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
    name: "ร้านเบเกอรี่บรรจุภัณฑ์ กาฬสินธุ์",
    branches: [
      { id: "b1", name: "สาขากาฬสินธุ์", lat: 16.4322, lng: 103.506, radius: 150 },
    ],
    shifts: [
      { id: "morning", name: "กะเช้า", start: "08:00", end: "17:00" },
      { id: "afternoon", name: "กะบ่าย", start: "13:00", end: "22:00" },
    ],
  },
];

// ล็อกกะจากระบบหลังบ้าน: true = พนักงานเปลี่ยนกะเองไม่ได้ (กะถูกกำหนดมาจากแอดมิน)
const LOCK_SHIFT = true;

// ลำดับการเช็ค — ทุกคนเหมือนกันหมด: เข้า / พักเที่ยงออก / พักเที่ยงเข้า / เลิก (พักเที่ยงไม่ต้องจับ GPS — req 5)
const PUNCH_STEPS = [
  { key: "in", label: "เช็คอินเข้างาน", short: "เข้างาน", compare: "in" },
  { key: "lunch_out", label: "สแกนพักเที่ยง (ออก)", short: "พักออก", compare: null, noGps: true },
  { key: "lunch_in", label: "สแกนพักเที่ยง (เข้า)", short: "พักเข้า", compare: null, noGps: true },
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

export default function CheckIn({ employee }) {
  const [companies, setCompanies] = useState(COMPANIES);
  const [companyId, setCompanyId] = useState(employee?.company_id || "bakery");
  const [branchId, setBranchId] = useState(employee?.branch_id || "b1");
  const [shiftId, setShiftId] = useState(employee?.shift_id || "morning");
  const employeeName = employee?.name || "สมหญิง ใจดี";
  const locked = Boolean(employee);   // พนักงานจริงถูกผูกสาขา/กะจากระบบหลังบ้าน

  const company = companies.find((c) => c.id === companyId) || companies[0];
  const branch = company.branches.find((b) => b.id === branchId) || company.branches[0];
  const shift = company.shifts.find((s) => s.id === shiftId) || company.shifts[0];

  const PUNCHES = PUNCH_STEPS;

  const [now, setNow] = useState(new Date());
  const [done, setDone] = useState([]);            // records ที่เช็คแล้ววันนี้ [in, out]
  const [coords, setCoords] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [queueCount, setQueueCount] = useState(getQueue().length);
  const [syncMsg, setSyncMsg] = useState(null);
  const [justPunched, setJustPunched] = useState(null);   // ล็อกปุ่มสั้นๆ หลังกดกันแตะซ้อน

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ออนไลน์/ออฟไลน์ — เน็ตกลับมาแล้วส่งคิวที่ค้างขึ้น DB
  useEffect(() => {
    async function goOnline() {
      setOnline(true);
      const q = getQueue();
      if (q.length) {
        const { sent, left } = await flushQueue();
        setQueueCount(left);
        if (sent) setSyncMsg(`ส่งเวลาที่บันทึกออฟไลน์ ${sent} รายการขึ้นระบบแล้ว`);
      }
    }
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    if (navigator.onLine) goOnline();          // เผื่อมีคิวค้างตอนเปิดแอป
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  // โหลดบริษัท/สาขา/กะจาก Supabase (ถ้าต่อไว้) + ยึดค่าเริ่มต้นตามพนักงาน
  useEffect(() => {
    let alive = true;
    fetchCompanies().then((list) => {
      if (!alive || !list || !list.length) return;
      setCompanies(list);
      const c = list.find((x) => x.id === employee?.company_id) || list[0];
      setCompanyId(c.id);
      setBranchId(employee?.branch_id || c.branches[0]?.id);
      setShiftId(employee?.shift_id || c.shifts[0]?.id);
    });
    return () => { alive = false; };
  }, [employee]);

  // โหลดการตอกบัตรของพนักงาน "วันนี้" จาก DB มาแสดงสถานะ
  useEffect(() => {
    if (!employee?.id) return;
    let alive = true;
    fetchTodayPunches(employee.id).then((logs) => {
      if (!alive || !logs) return;
      setDone(
        logs.map((l) => {
          const t = new Date(l.ts);
          const p = PUNCHES.find((x) => x.key === l.punch_type);
          return {
            key: l.punch_type,
            label: p?.short || l.punch_type,
            time: t,
            timeStr: t.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
            coords: l.lat != null ? { lat: l.lat, lng: l.lng } : null,
            distance: l.distance,
            status: shiftStatus(t, shift, p?.compare),
          };
        })
      );
    });
    return () => { alive = false; };
  }, [employee, shift]);

  // หาขั้นต่อไปจาก "ประเภทที่ยังไม่มี" ไม่ใช่นับจำนวนครั้ง — กันพังถ้ามีข้อมูลเก่าผิดประเภทปนอยู่
  // (เช่น เคยกดพักเที่ยงแล้วดันถูกบันทึกเป็น "เลิกงาน" ก่อนแก้บั๊ก — นับจำนวนอย่างเดียวจะข้ามขั้นไปผิด)
  const doneKeys = new Set(done.map((d) => d.key));
  const current = PUNCHES.find((s) => !doneKeys.has(s.key)) || null;
  const dayComplete = !current;

  const distance = useMemo(
    () => (coords ? distanceMeters(coords, branch) : null),
    [coords, branch]
  );
  const inRange = distance != null && distance <= branch.radius;
  // ไม่จับ GPS: (1) พักเที่ยงหลังร้าน (req 5) หรือ (2) เน็ตล่ม (บันทึกออฟไลน์)
  const noGps = Boolean(current?.noGps);
  const skipGps = noGps || !online;
  const ready = !dayComplete && (skipGps || inRange);

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

  async function doPunch() {
    if (!ready || justPunched) return;
    const t = new Date();
    const punch = current;
    const at = skipGps ? null : coords;    // ออฟไลน์/พักเที่ยง = ไม่เก็บพิกัด
    const dist = skipGps ? null : distance;
    const rec = {
      key: punch.key,
      label: punch.short,
      time: t,
      timeStr: t.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      coords: at,
      distance: dist,
      offline: !online,
      status: shiftStatus(t, shift, punch.compare),
    };
    setDone([...done, rec]);
    setCoords(null); setGpsError(null);   // เคลียร์ GPS ให้เช็คใหม่ครั้งถัดไป
    // ล็อกปุ่มไว้สั้นๆ กันแตะรัวซ้อนไปโดนขั้นถัดไปโดยไม่ตั้งใจ (เช่น กดพักเที่ยงเข้าเสร็จ แล้วมือไวกดโดนเลิกงานทันที)
    setJustPunched(rec);
    setTimeout(() => setJustPunched(null), 2500);
    if (employee?.id) {
      const payload = { employeeId: employee.id, punchType: punch.key, lat: at?.lat, lng: at?.lng, distance: dist, branchId: branch.id, ts: t.toISOString() };
      if (!online) {
        // เน็ตล่ม → เก็บในเครื่อง ส่งเมื่อเน็ตกลับ
        setQueueCount(enqueuePunch(payload));
        setSyncMsg(null);
      } else {
        const res = await savePunch(payload);
        if (res?.error) { setQueueCount(enqueuePunch(payload)); setGpsError("เน็ตมีปัญหา — เก็บไว้ส่งภายหลัง"); }
      }
    }
  }

  function resetDay() {
    setDone([]); setCoords(null); setGpsError(null);
  }
  function changeCompany(id) {
    const c = companies.find((x) => x.id === id);
    if (!c) return;
    setCompanyId(c.id); setBranchId(c.branches[0]?.id); setShiftId(c.shifts[0]?.id); resetDay();
  }

  const timeStr = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const recIn = done.find((d) => d.key === "in");
  const recOut = done.find((d) => d.key === "out");
  const recLunchOut = done.find((d) => d.key === "lunch_out");
  const recLunchIn = done.find((d) => d.key === "lunch_in");
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
          {(recLunchOut || recLunchIn) && (
            <div className="grid grid-cols-2 divide-x divide-white/20 border-t border-white/20 bg-white/10 text-center">
              <SummaryCell label="พักออก" value={recLunchOut ? recLunchOut.timeStr : "—"} />
              <SummaryCell label="พักเข้า" value={recLunchIn ? recLunchIn.timeStr : "—"} />
            </div>
          )}
        </div>

        {/* สาขา (กะถูกล็อก) */}
        <div className="space-y-2 rounded-2xl bg-white p-3 shadow-sm">
          <div className="flex gap-2">
            <select value={companyId} onChange={(e) => changeCompany(e.target.value)} disabled={locked}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm disabled:opacity-70">
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={branchId} onChange={(e) => { setBranchId(e.target.value); resetDay(); }}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
              {company.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {company.branches.length > 1 && <p className="text-xs text-slate-400">เลือกสาขาที่กำลังเช็คอิน</p>}
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

        {/* สถานะออนไลน์/ออฟไลน์ + คิวรอส่ง */}
        {!online ? (
          <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-100">
            📴 <b>ออฟไลน์</b> — บันทึกเวลาไว้ในเครื่อง (ไม่จับ GPS) · จะส่งขึ้นระบบอัตโนมัติเมื่อเน็ตกลับมา{queueCount > 0 ? ` · รอส่ง ${queueCount} รายการ` : ""}
          </div>
        ) : queueCount > 0 ? (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-100">⏳ กำลังส่งเวลาที่ค้าง {queueCount} รายการ…</div>
        ) : syncMsg ? (
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">✓ {syncMsg}</div>
        ) : null}

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
              {skipGps ? (
                /* ไม่ต้องจับ GPS: พักเที่ยงหลังร้าน (req 5) หรือ ออฟไลน์ — พักเที่ยงไม่โชว์ข้อความอธิบาย (ตามคำขอ) */
                !online ? (
                  <div className="mx-auto mb-4 flex items-center gap-2 rounded-full bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700">
                    📴 ออฟไลน์ — บันทึกเวลาโดยไม่เช็ค GPS
                  </div>
                ) : null
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
                </>
              )}
              {gpsError && <p className="mb-3 text-center text-xs text-rose-500">{gpsError}</p>}

              {justPunched ? (
                /* ล็อกไว้สั้นๆ กันแตะรัวโดนขั้นถัดไปโดยไม่ตั้งใจ (เช่น กดพักเที่ยงเข้าเสร็จแล้วมือไวกดโดนเลิกงาน) */
                <div className="mx-auto flex aspect-square w-56 flex-col items-center justify-center rounded-full bg-emerald-50 text-center">
                  <span className="text-4xl">✓</span>
                  <span className="mt-2 text-lg font-bold text-emerald-700">บันทึก{justPunched.label}แล้ว</span>
                  <span className="text-sm text-emerald-600">{justPunched.timeStr} น.</span>
                </div>
              ) : (
                <>
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
                    {ready ? "แตะปุ่มเพื่อบันทึกเวลา" : skipGps ? "แตะปุ่มเพื่อบันทึกเวลา" : "กด \"ตรวจ GPS\" ให้อยู่ในพื้นที่ร้านก่อน"}
                  </p>
                </>
              )}
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
