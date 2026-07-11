type LocaleSwitchProps = {
  locale: "en" | "ar";
  onToggle: () => void;
};

export function LocaleSwitch({ locale, onToggle }: LocaleSwitchProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-emerald-500/60 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      aria-label="Toggle language"
    >
      <span className="text-xs font-semibold uppercase tracking-[0.2em]">{locale === "en" ? "AR" : "EN"}</span>
      <span>{locale === "en" ? "English" : "العربية"}</span>
    </button>
  );
}
