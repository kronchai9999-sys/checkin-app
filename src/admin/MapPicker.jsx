import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// หมุด emoji แบบ divIcon — เลี่ยงปัญหา path ไอคอนดีฟอลต์ของ Leaflet ตอน build
const pinIcon = L.divIcon({
  html: '<div style="font-size:34px;line-height:1;transform:translateY(-6px)">📍</div>',
  className: "", iconSize: [34, 34], iconAnchor: [17, 34],
});

/**
 * ปักหมุดตำแหน่งบนแผนที่ (ซูมเข้าอัตโนมัติ) — ลาก/แตะเพื่อปรับหมุด แล้วยืนยัน
 * props: initialLat, initialLng, radius, onConfirm(lat,lng), onClose
 */
export default function MapPicker({ initialLat, initialLng, radius = 150, onConfirm, onClose }) {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const [pos, setPos] = useState({ lat: initialLat, lng: initialLng });
  const [locating, setLocating] = useState(!initialLat);

  useEffect(() => {
    function init(lat, lng) {
      const map = L.map(mapRef.current, { zoomControl: true }).setView([lat, lng], 18);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "© OpenStreetMap",
      }).addTo(map);

      const marker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
      const circle = L.circle([lat, lng], { radius, color: "#059669", fillColor: "#10b981", fillOpacity: 0.12, weight: 1.5 }).addTo(map);

      const move = (ll) => { setPos({ lat: ll.lat, lng: ll.lng }); circle.setLatLng(ll); };
      marker.on("drag", (e) => move(e.target.getLatLng()));
      map.on("click", (e) => { marker.setLatLng(e.latlng); move(e.latlng); });

      mapObj.current = map; markerRef.current = marker; circleRef.current = circle;
      setPos({ lat, lng });
    }

    if (initialLat && initialLng) {
      init(initialLat, initialLng);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => { setLocating(false); init(p.coords.latitude, p.coords.longitude); },
        () => { setLocating(false); init(16.4322, 103.506); },   // fallback: กาฬสินธุ์
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setLocating(false); init(16.4322, 103.506);
    }

    return () => { mapObj.current?.remove(); mapObj.current = null; };
  }, []); // eslint-disable-line

  // อัปเดตรัศมีวงกลมถ้า prop เปลี่ยนระหว่างเปิดอยู่
  useEffect(() => { circleRef.current?.setRadius(radius); }, [radius]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const ll = { lat: p.coords.latitude, lng: p.coords.longitude };
        mapObj.current?.setView(ll, 18);
        markerRef.current?.setLatLng(ll);
        circleRef.current?.setLatLng(ll);
        setPos(ll);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-2xl bg-white shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-800">📍 ปักหมุดตำแหน่งสาขา</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="relative h-80 w-full sm:h-96">
          <div ref={mapRef} className="h-full w-full" />
          {locating && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-slate-500">กำลังหาตำแหน่งปัจจุบัน…</div>
          )}
        </div>

        <div className="space-y-2 p-4">
          <p className="text-xs text-slate-500">ลากหมุด 📍 หรือแตะบนแผนที่เพื่อปรับตำแหน่งให้ตรงร้าน แล้วกดยืนยัน</p>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span>พิกัด: {pos.lat?.toFixed(6)}, {pos.lng?.toFixed(6)}</span>
            <button onClick={useMyLocation} className="font-medium text-sky-600">ใช้ตำแหน่งฉัน</button>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => onConfirm(pos.lat, pos.lng)} disabled={!pos.lat}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white active:bg-emerald-700 disabled:bg-slate-300">
              ✓ ยืนยันตำแหน่งนี้
            </button>
            <button onClick={onClose} className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-500 ring-1 ring-slate-200">ยกเลิก</button>
          </div>
        </div>
      </div>
    </div>
  );
}
