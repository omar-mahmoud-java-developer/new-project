export function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-400 text-sm font-bold text-white shadow-soft">
        ERP
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-[0.18em] text-slate-200">ENTERPRISE</div>
        <div className="text-base font-medium text-slate-400">Foundation Console</div>
      </div>
    </div>
  );
}
