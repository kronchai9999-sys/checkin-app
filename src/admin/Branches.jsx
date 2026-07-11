import { useState, useEffect } from "react";
import { fetchOrg, saveBranch, deleteBranch } from "../lib/db.js";
import { isSupabaseReady } from "../lib/supabase.js";
import { DEMO_ORG } from "../lib/demo.js";
import { canManageBranches } from "../lib/rules.js";
import { Page, PageHeader, Card, Field, inputCls, Empty, DemoTag } from "../ui.jsx";

const COMPANY_ID = "bakery";

export default function Branches({ employee }) {
  const allowed = canManageBranches(employee?.role);
  const [branches, setBranches] = useState(DEMO_ORG.branches);
  const [form, setForm] = useState({ name: "", radius: 150, lat: "", lng: "" });
  const [msg, setMsg] = useState(null);
  const [gps, setGps] = useState(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const o = await fetchOrg();
    if (o) setBranches(o.branches);
  }
  useEffect(() => { refresh(); }, []);

  function getLocation(cb) {
    setGps("กำลังอ่านพิกัด…");
    if (!navigator.geolocation) { setGps("อุปกรณ์ไม่รองรับ GPS"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps(null); cb(pos.coords.latitude, pos.coords.longitude); },
      () => setGps("อ่านพิกัดไม่ได้ — เปิดสิทธิ์ตำแหน่ง"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function addBranch(e) {
    e?.preventDefault();
    if (busy) return;
    if (!form.name.trim()) { setMsg({ ok: false, text: "กรอกชื่อสาขา" }); return; }
    if (form.lat === "" || form.lng === "") { setMsg({ ok: false, text: 'กด "ใช้ตำแหน่งปัจจุบัน" หรือกรอกพิกัดก่อน' }); return; }
    setBusy(true); setMsg(null);
    const branch = {
      id: "b" + Date.now().toString(36), company_id: COMPANY_ID, name: form.name.trim(),
      lat: Number(form.lat), lng: Number(form.lng), radius: Number(form.radius) || 150,
    };
    const res = await saveBranch(branch);
    setBusy(false);
    if (res?.error) { setMsg({ ok: false, text: "เพิ่มไม่สำเร็จ: " + res.error }); return; }
    if (res?.demo) setBranches((b) => [...b, branch]); else await refresh();
    setMsg({ ok: true, text: `เพิ่มสาขา "${branch.name}" แล้ว` });
    setForm({ name: "", radius: 150, lat: "", lng: "" });
  }

  async function patchBranch(b, patch) {
    const next = { ...b, ...patch };
    setBranches((list) => list.map((x) => (x.id === b.id ? next : x)));
    await saveBranch({ id: b.id, company_id: b.company_id || COMPANY_ID, name: next.name, lat: Number(next.lat), lng: Number(next.lng), radius: Number(next.radius) || 150 });
  }
  async function removeBranch(b) {
    if (branches.length <= 1) { setMsg({ ok: false, text: "ต้องมีอย่างน้อย 1 สาขา" }); return; }
    setBranches((list) => list.filter((x) => x.id !== b.id));
    await deleteBranch(b.id);
  }

  if (!allowed) return <Page><PageHeader icon="🔒" title="จัดการสาขา" accent="sky" /><Card><Empty>เฉพาะผู้บริหารเท่านั้น</Empty></Card></Page>;

  return (
    <Page>
      <PageHeader icon="🏢" title="จัดการสาขา" accent="sky" subtitle="เพิ่ม/แก้สาขา · ตั้งพิกัด GPS ด้วยตำแหน่งปัจจุบัน" />
      {!isSupabaseReady && <DemoTag />}

      {/* เพิ่มสาขา */}
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">เพิ่มสาขาใหม่</h2>
        <form onSubmit={addBranch} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="ชื่อสาขา"><input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="เช่น สาขาในเมือง" /></Field>
            <Field label="รัศมีอนุญาต (เมตร)"><input type="number" min="20" className={inputCls} value={form.radius} onChange={(e) => setForm((f) => ({ ...f, radius: e.target.value }))} /></Field>
          </div>
          <div className="flex items-end gap-2">
            <div className="grid flex-1 grid-cols-2 gap-3">
              <Field label="ละติจูด (lat)"><input className={inputCls} value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} placeholder="16.43" /></Field>
              <Field label="ลองจิจูด (lng)"><input className={inputCls} value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} placeholder="103.50" /></Field>
            </div>
            <button type="button" onClick={() => getLocation((lat, lng) => setForm((f) => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) })))}
              className="rounded-xl bg-sky-600 px-3 py-2.5 text-sm font-semibold text-white active:bg-sky-700">📍 ตำแหน่งปัจจุบัน</button>
          </div>
          {gps && <p className="text-xs text-slate-500">{gps}</p>}
          {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-rose-500"}`}>{msg.text}</p>}
          <button type="submit" disabled={busy} className={`w-full rounded-xl py-3 text-sm font-semibold text-white ${busy ? "bg-slate-300" : "bg-emerald-600 active:bg-emerald-700"}`}>{busy ? "กำลังเพิ่ม…" : "➕ เพิ่มสาขา"}</button>
        </form>
      </Card>

      {/* รายการสาขา */}
      <Card className="!p-0">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">สาขาทั้งหมด ({branches.length})</div>
        {branches.map((b) => (
          <div key={b.id} className="space-y-2 border-b border-slate-50 px-4 py-3 last:border-0">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="ชื่อสาขา"><input className={inputCls} defaultValue={b.name} onBlur={(e) => e.target.value !== b.name && patchBranch(b, { name: e.target.value })} /></Field>
              <Field label="รัศมี (ม.)"><input type="number" className={inputCls} defaultValue={b.radius} onBlur={(e) => Number(e.target.value) !== b.radius && patchBranch(b, { radius: e.target.value })} /></Field>
              <Field label="พิกัด"><div className="mt-1 truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">{Number(b.lat).toFixed(4)}, {Number(b.lng).toFixed(4)}</div></Field>
              <div className="flex items-end gap-1.5">
                <button onClick={() => getLocation((lat, lng) => patchBranch(b, { lat, lng }))} className="flex-1 rounded-xl bg-sky-50 px-2 py-2.5 text-xs font-medium text-sky-600 ring-1 ring-sky-200">📍 ตั้งพิกัดที่นี่</button>
                <button onClick={() => removeBranch(b)} className="rounded-xl bg-rose-50 px-2.5 py-2.5 text-xs font-medium text-rose-500 ring-1 ring-rose-200">ลบ</button>
              </div>
            </div>
          </div>
        ))}
      </Card>
      <p className="mt-3 px-1 text-xs text-slate-400">* พนักงานจะเลือกสาขาที่กำลังเช็คอินได้เอง (มีหลายสาขา) · แก้ชื่อ/รัศมีแล้วคลิกออกจากช่องเพื่อบันทึก</p>
    </Page>
  );
}
