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
      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-emerald-500/60 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      aria-label="Toggle theme"
    >
      <Icon className="h-4 w-4" />
      <span>{mode === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
