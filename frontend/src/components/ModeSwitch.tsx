import { MoonStar, SunMedium } from "lucide-react";

type ModeSwitchProps = {
  mode: "light" | "dark";
  onToggle: () => void;
};

export function ModeSwitch({ mode, onToggle }: ModeSwitchProps) {
  const Icon = mode === "dark" ? SunMedium : MoonStar;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200/10 bg-slate-950/30 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-brand-400/60 hover:bg-slate-900/60"
      aria-label="Toggle theme"
    >
      <Icon className="h-4 w-4" />
      <span>{mode === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
