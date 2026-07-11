type LocaleSwitchProps = {
  locale: "en" | "ar";
  onToggle: () => void;
};

export function LocaleSwitch({ locale, onToggle }: LocaleSwitchProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200/10 bg-slate-950/30 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-brand-400/60 hover:bg-slate-900/60"
      aria-label="Toggle language"
    >
      <span className="text-xs font-semibold uppercase tracking-[0.2em]">{locale === "en" ? "AR" : "EN"}</span>
      <span>{locale === "en" ? "English" : "العربية"}</span>
    </button>
  );
}
