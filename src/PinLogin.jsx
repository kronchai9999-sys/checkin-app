import { useState } from "react";
import { loginByPin } from "./lib/db.js";
import { isSupabaseReady } from "./lib/supabase.js";

/**
 * หน้าเข้าสู่ระบบด้วยรหัส PIN 6 หลัก
 * - ต่อ Supabase: ตรวจ PIN ผ่าน RPC login_by_pin แล้วคืนข้อมูลพนักงาน
 * - โหมดเดโม (ยังไม่ตั้ง env): เทียบกับ DEMO_PIN ในเครื่อง
 */
const DEMO_PIN = "123456";
const PIN_LENGTH = 6;

export default function PinLogin({ onSuccess }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  function press(d) {
    setError(false);
    if (pin.length >= PIN_LENGTH) return;
    setPin(pin + d);
  }
  function backspace() {
    setError(false);
    setPin(pin.slice(0, -1));
  }
  function clear() {
    setError(false);
    setPin("");
  }
  async function submit() {
    if (busy || pin.length < PIN_LENGTH) return;
    setBusy(true);
    try {
      const emp = await loginByPin(pin);
      if (emp === undefined) {
        // โหมดเดโม (ไม่ได้ต่อ DB) — เทียบ PIN ทดสอบ
        if (pin === DEMO_PIN) return onSuccess(null);
        setError(true);
        setPin("");
      } else if (emp) {
        onSuccess(emp);
      } else {
        setError(true);
        setPin("");
      }
    } finally {
      setBusy(false);
    }
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

  return (
    <div className="flex min-h-screen flex-col items-center bg-gradient-to-b from-amber-700 to-amber-900 px-6 pt-16">
      {/* โลโก้ */}
      <div className="flex h-32 w-32 items-center justify-center rounded-3xl bg-rose-50 shadow-lg">
        <div className="text-center leading-tight">
          <div className="text-2xl font-extrabold text-fuchsia-600">เบเกอร์<span className="text-amber-500">S</span></div>
          <div className="text-xs font-bold text-fuchsia-700">บรรจุภัณฑ์</div>
          <div className="mt-1 text-[9px] text-slate-500">☎ 043-014-466</div>
          <div className="text-[9px] text-slate-500">ID line : bb014466</div>
        </div>
      </div>
      <h1 className="mt-5 text-2xl font-bold text-white">เข้าสู่ระบบ</h1>

      {/* การ์ดคีย์แพด */}
      <div className="mt-6 w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <p className="text-center text-sm text-slate-500">กรอกรหัส PIN ของคุณ</p>

        {/* จุดแสดงจำนวนหลัก */}
        <div className="mt-4 flex justify-center gap-3">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full transition ${
                error ? "bg-rose-400" : i < pin.length ? "bg-slate-500" : "bg-slate-300"
              }`}
            />
          ))}
        </div>
        {error && <p className="mt-2 text-center text-xs text-rose-500">รหัส PIN ไม่ถูกต้อง ลองใหม่อีกครั้ง</p>}

        {/* ปุ่มตัวเลข */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {keys.map((k) => {
            if (k === "clear")
              return (
                <button key={k} onClick={clear}
                  className="rounded-2xl bg-slate-50 py-5 text-base font-medium text-slate-500 active:bg-slate-200">
                  ล้าง
                </button>
              );
            if (k === "back")
              return (
                <button key={k} onClick={backspace}
                  className="rounded-2xl bg-slate-50 py-5 text-2xl text-slate-500 active:bg-slate-200">
                  ⌫
                </button>
              );
            return (
              <button key={k} onClick={() => press(k)}
                className="rounded-2xl bg-slate-50 py-5 text-2xl font-semibold text-slate-700 active:bg-slate-200">
                {k}
              </button>
            );
          })}
        </div>

        {/* ปุ่มเข้าสู่ระบบ */}
        <button onClick={submit} disabled={pin.length < PIN_LENGTH || busy}
          className={`mt-5 w-full rounded-2xl py-4 text-base font-bold transition ${
            pin.length < PIN_LENGTH || busy
              ? "cursor-not-allowed bg-slate-300 text-white"
              : "bg-slate-500 text-white active:bg-slate-600"
          }`}>
          {busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
        </button>
      </div>
      {!isSupabaseReady && <p className="mt-4 text-xs text-white/60">โหมดเดโม · PIN ทดสอบ: {DEMO_PIN}</p>}
    </div>
  );
}
