import { savePunch } from "./db.js";

// คิวการตอกบัตรออฟไลน์ (เน็ตล่ม) — เก็บในเครื่อง ส่งเมื่อเน็ตกลับ
const QKEY = "offline_punches";

export function getQueue() {
  try { return JSON.parse(localStorage.getItem(QKEY)) || []; } catch { return []; }
}
function setQueue(arr) {
  localStorage.setItem(QKEY, JSON.stringify(arr));
}
export function enqueuePunch(punch) {
  const q = getQueue();
  q.push(punch);
  setQueue(q);
  return q.length;
}

// ส่งคิวขึ้น DB ทีละรายการ — สำเร็จค่อยเอาออก (ถ้าส่งไม่ได้เก็บไว้ก่อน)
export async function flushQueue() {
  let q = getQueue();
  if (!q.length) return { sent: 0, left: 0 };
  const remaining = [];
  let sent = 0;
  for (const p of q) {
    const res = await savePunch(p);
    if (res?.ok || res?.demo) sent++;
    else remaining.push(p);
  }
  setQueue(remaining);
  return { sent, left: remaining.length };
}
