import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import { BrandMark } from "@/components/BrandMark";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { ModeSwitch } from "@/components/ModeSwitch";
import { copy } from "@/app/copy";
import { navigationGroups } from "@/app/navigation";
import { useUiStore } from "@/stores/uiStore";

export function AppShell() {
  const locale = useUiStore((state) => state.locale);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const toggleLocale = useUiStore((state) => state.toggleLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [locale, theme]);

  const ui = copy[locale];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-4 md:px-6 lg:px-8">
        <header className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <BrandMark />
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                API ready
              </div>
              <ModeSwitch mode={theme} onToggle={toggleTheme} />
              <LocaleSwitch locale={locale} onToggle={toggleLocale} />
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">{ui.workspace}</p>
              <h1 className="mt-2 text-xl font-semibold">{ui.brand}</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{ui.tagline}</p>
            </div>

            <nav aria-label="Primary" className="space-y-4">
              {navigationGroups.map(({ key, items }) => (
                <div key={key ?? "root"}>
                  {key ? (
                    <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                      {ui.navGroups[key]}
                    </p>
                  ) : null}
                  <div className="space-y-1">
                    {items.map(({ label, icon: Icon }) => (
                      <a
                        key={label}
                        href="#"
                        className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                      >
                        <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span>{label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">{ui.systemHealth}</p>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Uptime</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-300">99.98%</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Latency</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">42 ms</span>
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">{ui.operationsPulse}</p>
                  <h2 className="mt-2 text-3xl font-semibold">Enterprise command center</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                    A responsive, mobile-first shell for future ERP modules with clear
                    navigation, accessible surfaces, and bilingual direction support.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Modules" value="21" />
                  <Metric label="Ready" value="Foundation" />
                  <Metric label="Locale" value={locale.toUpperCase()} />
                </div>
              </div>
            </section>

            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[120px] rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-white">{value}</div>
    </div>
  );
}
