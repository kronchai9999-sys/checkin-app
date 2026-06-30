import { useState, useRef, useEffect, useMemo } from "react";

/**
 * แอปเช็คอินพนักงาน (Standalone PWA) — ตอกบัตร 4 ครั้ง/วัน
 * ------------------------------------------------------------------
 * ลำดับการตอกบัตร: เข้างาน(เช้า) -> พักเที่ยงออก -> หลังพักเที่ยงเข้า -> เลิกงาน
 * แต่ละครั้งต้อง: เซลฟี่ (เห็นหน้า+เห็นร้าน) + พิกัด GPS ในรัศมีร้าน
 * - คำนวณสาย (ตอน "เข้างาน") และ OT/ออกก่อนเวลา (ตอน "เลิกงาน")
 * - หลายกะ / หลายบริษัท / หลายสาขา
 * - "โหมดสาธิต" สำหรับ preview ที่กล้อง/GPS ถูกบล็อก
 *
 * ระบบจริง: insert attendance_logs ทุกครั้งที่ตอก (type=in/lunch_out/lunch_in/out)
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

// ลำดับการตอกบัตร 4 ครั้ง/วัน
const PUNCHES = [
  { key: "in", label: "เข้างาน (เช้า)", compare: "in" },
  { key: "lunch_out", label: "พักเที่ยง (ออก)", compare: null },
  { key: "lunch_in", label: "หลังพักเที่ยง (เข้า)", compare: null },
  { key: "out", label: "เลิกงาน", compare: "out" },
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
  const [done, setDone] = useState([]);            // punch records ที่ตอกแล้ววันนี้
  const [photo, setPhoto] = useState(null);
  const [coords, setCoords] = useState(null);
  const [gpsError, setGpsError] = useState(null);
  const [camActive, setCamActive] = useState(false);
  const [camError, setCamError] = useState(null);
  const [demoMode, setDemoMode] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => stopCamera(), []);

  const idx = done.length;                         // ตอกบัตรครั้งต่อไป (0..3)
  const current = PUNCHES[idx] || null;
  const dayComplete = idx >= PUNCHES.length;

  const distance = useMemo(
    () => (coords ? distanceMeters(coords, branch) : null),
    [coords, branch]
  );
  const inRange = distance != null && distance <= branch.radius;
  const ready = photo && inRange && !dayComplete;

  async function startCamera() {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamActive(true);
    } catch (err) {
      setCamError("เปิดกล้องไม่ได้ในหน้านี้ (preview บล็อก) — ใช้โหมดสาธิตแทน");
      setDemoMode(true);
    }
  }
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamActive(false);
  }
  function capturePhoto() {
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setPhoto(canvas.toDataURL("image/jpeg", 0.8));
    stopCamera();
  }
  function demoPhoto() {
    const canvas = document.createElement("canvas");
    canvas.width = 320; canvas.height = 320;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#10b981"; ctx.fillRect(0, 0, 320, 320);
    ctx.fillStyle = "#fff"; ctx.font = "20px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("รูปเซลฟี่ (สาธิต)", 160, 150);
    ctx.fillText("เห็นหน้า + เห็นร้าน", 160, 180);
    setPhoto(canvas.toDataURL("image/jpeg", 0.8));
  }
  function getLocation() {
    setGpsError(null);
    if (demoMode || !navigator.geolocation) {
      setCoords({ lat: branch.lat + 0.0003, lng: branch.lng + 0.0002 });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { setGpsError("อ่านพิกัดไม่ได้ — ใช้โหมดสาธิต"); setDemoMode(true); setCoords({ lat: branch.lat + 0.0003, lng: branch.lng + 0.0002 }); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function doPunch() {
    const t = new Date();
    const rec = {
      key: current.key,
      label: current.label,
      time: t,
      timeStr: t.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      photo,
      coords,
      distance,
      status: shiftStatus(t, shift, current.compare),
    };
    setDone([...done, rec]);
    setPhoto(null); setCoords(null); setCamError(null); setGpsError(null);
    // ระบบจริง: upload รูป + insert attendance_logs (type=current.key, ts, lat, lng, distance)
  }

  function resetDay() {
    setDone([]); setPhoto(null); setCoords(null); setCamError(null); setGpsError(null);
  }
  function changeCompany(id) {
    const c = COMPANIES.find((x) => x.id === id);
    setCompanyId(c.id); setBranchId(c.branches[0].id); setShiftId(c.shifts[0].id); resetDay();
  }

  const timeStr = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const accent = current && current.compare === "out" ? "sky" : "emerald";

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-100 p-4" style={TH}>
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-xl">
        {/* Header */}
        <div className={`px-5 pb-6 pt-5 text-white bg-gradient-to-br ${accent === "sky" ? "from-sky-600 to-sky-500" : "from-emerald-600 to-emerald-500"}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs opacity-80">{company.name}</div>
              <div className="text-lg font-bold leading-tight">
                {dayComplete ? "ตอกบัตรครบแล้ววันนี้" : `ตอกบัตร: ${current.label}`}
              </div>
            </div>
            <div className="text-right text-xs opacity-90">{employeeName}</div>
          </div>
          <div className="mt-4 text-center">
            <div className="text-4xl font-bold tabular-nums tracking-wide">{timeStr}</div>
            <div className="mt-1 text-xs opacity-90">{dateStr}</div>
          </div>
        </div>

        {/* สาขา + กะ */}
        <div className="space-y-2 border-b border-slate-100 px-5 py-3">
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

        {/* ไทม์ไลน์ 4 ครั้ง */}
        <div className="space-y-1.5 border-b border-slate-100 px-5 py-3">
          {PUNCHES.map((p, i) => {
            const rec = done[i];
            const isCurrent = i === idx && !dayComplete;
            return (
              <div key={p.key} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${isCurrent ? "bg-emerald-50 ring-1 ring-emerald-200" : rec ? "" : "opacity-50"}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${rec ? "bg-emerald-600 text-white" : isCurrent ? "bg-emerald-200 text-emerald-700" : "bg-slate-200 text-slate-400"}`}>
                  {rec ? "✓" : i + 1}
                </span>
                <span className="flex-1 text-sm text-slate-700">{p.label}</span>
                {rec ? (
                  <span className="text-right">
                    <span className="text-sm font-semibold tabular-nums text-slate-800">{rec.timeStr}</span>
                    {rec.status && <StatusBadge status={rec.status} />}
                  </span>
                ) : isCurrent ? (
                  <span className="text-xs font-medium text-emerald-600">กำลังตอก</span>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* เนื้อหา */}
        <div className="space-y-4 p-5">
          {dayComplete ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
              <div className="text-lg font-bold text-slate-900">ตอกบัตรครบ 4 ครั้งแล้ว</div>
              <div className="mt-1 text-sm text-slate-500">ข้อมูลถูกบันทึก รอตรวจ/แก้ไขก่อนคิดเงินเดือน</div>
              <button onClick={resetDay} className="mt-4 text-sm text-emerald-600 underline">ทดสอบใหม่</button>
            </div>
          ) : (
            <>
              <Step n="①" title="ถ่ายเซลฟี่ (ให้เห็นหน้า + เห็นร้าน)" done={!!photo}>
                {photo ? (
                  <div className="relative">
                    <img src={photo} alt="selfie" className="w-full rounded-xl object-cover" />
                    <button onClick={() => setPhoto(null)} className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">ถ่ายใหม่</button>
                  </div>
                ) : camActive ? (
                  <div className="space-y-2">
                    <video ref={videoRef} playsInline className="w-full rounded-xl bg-black" style={{ transform: "scaleX(-1)" }} />
                    <button onClick={capturePhoto} className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white">📸 กดถ่าย</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button onClick={startCamera} className="w-full rounded-xl bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">เปิดกล้องถ่ายเซลฟี่</button>
                    {(camError || demoMode) && <button onClick={demoPhoto} className="w-full rounded-xl bg-amber-50 py-2.5 text-sm font-medium text-amber-700 ring-1 ring-amber-200">ใช้รูปสาธิต (preview)</button>}
                    {camError && <p className="text-xs text-rose-500">{camError}</p>}
                  </div>
                )}
              </Step>

              <Step n="②" title="ตรวจพิกัดร้าน" done={inRange}>
                {coords ? (
                  <div className={`rounded-xl p-3 text-sm ${inRange ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{inRange ? "✓ อยู่ในพื้นที่ร้าน" : "✗ อยู่นอกพื้นที่ร้าน"}</span>
                      <span className="tabular-nums">ห่าง {distance} ม.</span>
                    </div>
                    <div className="mt-1 text-xs opacity-70">อนุญาตในรัศมี {branch.radius} ม. จาก {branch.name}</div>
                    {!inRange && <button onClick={getLocation} className="mt-2 text-xs underline">เช็คพิกัดอีกครั้ง</button>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button onClick={getLocation} className="w-full rounded-xl bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">📍 ตรวจพิกัดปัจจุบัน</button>
                    {gpsError && <p className="text-xs text-rose-500">{gpsError}</p>}
                  </div>
                )}
              </Step>

              <button onClick={doPunch} disabled={!ready}
                className={`w-full rounded-2xl py-4 text-base font-bold transition ${ready ? (accent === "sky" ? "bg-sky-600 text-white shadow-lg shadow-sky-200" : "bg-emerald-600 text-white shadow-lg shadow-emerald-200") : "cursor-not-allowed bg-slate-100 text-slate-400"}`}>
                {ready ? `ตอกบัตร: ${current.label}` : "ถ่ายเซลฟี่ + ตรวจพิกัดให้ครบก่อน"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const c = status.tone === "bad" ? "text-rose-600" : status.tone === "ot" ? "text-amber-600" : "text-emerald-600";
  return <div className={`text-xs font-medium ${c}`}>{status.label}</div>;
}

function Step({ n, title, done, children }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}>{done ? "✓" : n}</span>
        <span className="text-sm font-semibold text-slate-700">{title}</span>
      </div>
      {children}
    </div>
  );
}
