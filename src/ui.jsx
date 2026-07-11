// ชุด UI กลาง — ใช้ให้ทุกหน้าหน้าตาเป็นชุดเดียวกัน
export const TH = { fontFamily: '"Sarabun","Noto Sans Thai","Prompt",sans-serif' };

export function Page({ children, className = "" }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100" style={TH}>
      <div className={`mx-auto max-w-2xl px-4 pb-28 pt-5 ${className}`}>{children}</div>
    </div>
  );
}

export function PageHeader({ icon, title, subtitle, accent = "emerald", right }) {
  const grad = {
    emerald: "from-emerald-500 to-teal-500",
    rose: "from-rose-500 to-pink-500",
    sky: "from-sky-500 to-indigo-500",
    amber: "from-amber-500 to-orange-500",
  }[accent];
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${grad} text-2xl text-white shadow-lg shadow-emerald-200/40`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className = "" }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 ${className}`}>{children}</div>;
}

export function Stat({ label, value, sub, tone = "slate" }) {
  const c = { slate: "text-slate-800", rose: "text-rose-600", amber: "text-amber-600", emerald: "text-emerald-600", sky: "text-sky-600" }[tone];
  return (
    <Card className="text-center">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${c}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </Card>
  );
}

export const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white";

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function Select({ value, onChange, children, disabled }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled} className={`${inputCls} disabled:opacity-60`}>
      {children}
    </select>
  );
}

export function Badge({ children, tone = "slate" }) {
  const c = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    sky: "bg-sky-50 text-sky-700",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

export function Empty({ children }) {
  return <div className="py-10 text-center text-sm text-slate-400">{children}</div>;
}

export function DemoTag() {
  return (
    <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs text-amber-700 ring-1 ring-amber-100">
      โหมดเดโม · ข้อมูลตัวอย่าง (ต่อ Supabase แล้วจะเป็นข้อมูลจริง)
    </div>
  );
}
