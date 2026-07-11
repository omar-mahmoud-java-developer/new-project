# Shell UI Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the existing dashboard shell from dark-glass/blue to a flat, dark-high-contrast zinc/black + emerald look (with a matching flat light-mode variant), drop the 28px glass corners for 10px flat corners, and split the 15-item flat sidebar nav into 5 labeled groups.

**Architecture:** Pure frontend visual change. No new components, no routing changes, no backend. One shared color/radius vocabulary (Tailwind's built-in `zinc` and `emerald` scales plus a single `10px` `2xl` radius override) gets applied consistently across 7 existing files. `navigation.ts` changes shape from a flat array to a grouped array; `copy.ts` gains translated group labels; `AppShell.tsx`'s nav renders two levels instead of one.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3, Vite. No test runner is configured in this project (`frontend/package.json` has no `test` script) — verification for this plan is `tsc`/`vite build` (type + build correctness) and `eslint` (lint correctness), plus a manual visual check across both themes and both locales, since there is no application logic here to unit test.

## Global Constraints

- Radius: every card/panel/nav-item/button corner becomes exactly `10px` (via the `2xl` Tailwind radius token). Pill-shaped elements (`rounded-full` badges, `ModeSwitch`/`LocaleSwitch` buttons) keep `rounded-full` — they're a shape choice, not part of the corner-radius change.
- No `backdrop-blur-*` and no `shadow-soft`/`shadow-lift` anywhere — surfaces are flat with a 1px border only.
- Accent color is Tailwind's built-in `emerald` scale everywhere a `brand-*` class is used today. No custom color scale is defined for it — use `emerald-*` utility classes directly.
- Base surfaces use Tailwind's built-in `zinc` scale: `zinc-50`/`white` for light mode, `zinc-950`/`zinc-900` for dark mode, switched via the `dark:` variant (already wired — `AppShell.tsx` toggles the `dark` class on `<html>`, and `tailwind.config.ts` already has `darkMode: ["class"]`).
- Font stays Manrope — no change to `global.css`'s font import or `font-family`.
- `npm run check` (`lint` + `build`) must pass after every task that touches `.tsx`/`.ts` files.
- All commands below run from `frontend/` (`cd "/home/omar/new project/frontend"`).

---

### Task 1: Tailwind tokens + global CSS

**Files:**
- Modify: `frontend/tailwind.config.ts` (full file)
- Modify: `frontend/src/styles/global.css` (full file)

**Interfaces:**
- Produces: a `2xl` border-radius token resolving to `10px` (consumed by every `rounded-2xl` class in later tasks). No more `brand`, `surface`, `surfaceAlt`, `outline` custom colors, and no more `soft`/`lift` shadow tokens — later tasks must not reference `brand-*`, `bg-surface`, `text-outline`, `shadow-soft`, or `shadow-lift`.

- [ ] **Step 1: Replace `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        "2xl": "10px",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
```

- [ ] **Step 2: Replace `frontend/src/styles/global.css`**

```css
@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap");

@tailwind base;
@tailwind components;
@tailwind utilities;

html {
  color-scheme: light;
  background: #fafafa;
}

html.dark {
  color-scheme: dark;
  background: #09090b;
}

body {
  min-height: 100vh;
  font-family:
    "Manrope", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: inherit;
}

#root {
  min-height: 100vh;
}

* {
  box-sizing: border-box;
}

::selection {
  background: rgba(52, 211, 153, 0.3);
}
```

- [ ] **Step 3: Verify build still passes (other files still reference old classes at this point — expect failures there, not here)**

Run: `cd "/home/omar/new project/frontend" && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (this step only touched CSS/config, no `.tsx` files — TypeScript is unaffected regardless of what Tailwind classes exist elsewhere)

- [ ] **Step 4: Commit**

```bash
cd "/home/omar/new project/frontend" && git add tailwind.config.ts src/styles/global.css
git commit -m "style: replace glass/blue tokens with flat zinc+emerald tokens"
```

---

### Task 2: Grouped navigation data + translations

**Files:**
- Modify: `frontend/src/app/navigation.ts` (full file)
- Modify: `frontend/src/app/copy.ts` (full file)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `navigationGroups: readonly NavGroup[]` from `navigation.ts` where `NavGroup = { key: NavGroupKey | null; items: readonly { label: string; icon: LucideIcon }[] }` and `NavGroupKey = "access" | "people" | "finance" | "operations" | "system"`. Produces `copy[locale].navGroups: Record<NavGroupKey, string>` from `copy.ts`. Task 3 (`AppShell.tsx`) imports both `navigationGroups` and reads `ui.navGroups[key]`.

- [ ] **Step 1: Replace `frontend/src/app/navigation.ts`**

```ts
import {
  Activity,
  Banknote,
  Bell,
  Boxes,
  ChartColumn,
  Clock3,
  CreditCard,
  FileText,
  LayoutDashboard,
  Mail,
  Package,
  Shield,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";

export type NavGroupKey = "access" | "people" | "finance" | "operations" | "system";

export type NavItem = {
  label: string;
  icon: typeof LayoutDashboard;
};

export type NavGroup = {
  key: NavGroupKey | null;
  items: readonly NavItem[];
};

export const navigationGroups: readonly NavGroup[] = [
  { key: null, items: [{ label: "Dashboard", icon: LayoutDashboard }] },
  {
    key: "access",
    items: [
      { label: "Authentication", icon: Shield },
      { label: "Users", icon: Users },
    ],
  },
  {
    key: "people",
    items: [
      { label: "HR", icon: Workflow },
      { label: "Attendance", icon: Clock3 },
      { label: "Payroll", icon: Wallet },
    ],
  },
  {
    key: "finance",
    items: [
      { label: "Accounting", icon: Banknote },
      { label: "Expenses", icon: CreditCard },
    ],
  },
  {
    key: "operations",
    items: [
      { label: "Inventory", icon: Boxes },
      { label: "Manufacturing", icon: Package },
    ],
  },
  {
    key: "system",
    items: [
      { label: "Notifications", icon: Bell },
      { label: "Email", icon: Mail },
      { label: "Reports", icon: ChartColumn },
      { label: "Audit", icon: Activity },
      { label: "Documents", icon: FileText },
    ],
  },
] as const;
```

- [ ] **Step 2: Replace `frontend/src/app/copy.ts`**

```ts
export const copy = {
  en: {
    brand: "Enterprise ERP",
    tagline: "Foundation shell for a modular ERP platform",
    workspace: "Workspace",
    moduleLaunchpad: "Module launchpad",
    systemHealth: "System health",
    releaseReadiness: "Release readiness",
    operationsPulse: "Operations pulse",
    locale: "AR",
    theme: "Theme",
    navGroups: {
      access: "Access",
      people: "People",
      finance: "Finance",
      operations: "Operations",
      system: "System",
    },
  },
  ar: {
    brand: "نظام ERP المؤسسي",
    tagline: "هيكل تأسيسي لمنصة ERP معيارية",
    workspace: "مساحة العمل",
    moduleLaunchpad: "لوحة الوحدات",
    systemHealth: "حالة النظام",
    releaseReadiness: "جاهزية الإصدار",
    operationsPulse: "نبض العمليات",
    locale: "EN",
    theme: "المظهر",
    navGroups: {
      access: "الوصول",
      people: "الموظفون",
      finance: "المالية",
      operations: "العمليات",
      system: "النظام",
    },
  },
} as const;
```

- [ ] **Step 3: Verify — this will currently fail because `AppShell.tsx` still imports the old `navigation` export**

Run: `cd "/home/omar/new project/frontend" && npx tsc --noEmit -p tsconfig.json`
Expected: FAIL with `Module '"@/app/navigation"' has no exported member 'navigation'.` — confirms the old export is gone and Task 3 is required next. Do not fix `AppShell.tsx` here.

- [ ] **Step 4: Commit**

```bash
cd "/home/omar/new project/frontend" && git add src/app/navigation.ts src/app/copy.ts
git commit -m "feat: group sidebar navigation into sections with EN/AR labels"
```

---

### Task 3: AppShell restyle + grouped nav rendering

**Files:**
- Modify: `frontend/src/layouts/AppShell.tsx` (full file)

**Interfaces:**
- Consumes: `navigationGroups` and `NavGroupKey` from `@/app/navigation` (Task 2), `copy` from `@/app/copy` (Task 2, includes `navGroups`).
- Produces: no new exports consumed elsewhere — `AppShell` is the route element, already wired in `App.tsx` (unchanged).

- [ ] **Step 1: Replace `frontend/src/layouts/AppShell.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify — will still fail because `OverviewPage.tsx`, `BrandMark.tsx`, `ModeSwitch.tsx`, `LocaleSwitch.tsx` still reference old `brand-*` classes (Tailwind class errors don't fail `tsc`, but check for TS errors specifically from this file)**

Run: `cd "/home/omar/new project/frontend" && npx tsc --noEmit -p tsconfig.json`
Expected: PASS with zero errors referencing `AppShell.tsx` (remaining files are untouched and type-correct on their own — Tailwind class names are strings, not type-checked, so stale `brand-*` classes elsewhere don't cause `tsc` failures; they're a visual bug fixed in Task 5)

- [ ] **Step 3: Commit**

```bash
cd "/home/omar/new project/frontend" && git add src/layouts/AppShell.tsx
git commit -m "style: restyle AppShell to flat zinc+emerald, render grouped nav"
```

---

### Task 4: OverviewPage restyle

**Files:**
- Modify: `frontend/src/pages/OverviewPage.tsx` (full file)

**Interfaces:**
- Consumes: nothing from other tasks (no data dependency, pure presentational component already rendered via `<Outlet />` in `AppShell`).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Replace `frontend/src/pages/OverviewPage.tsx`**

```tsx
const panels = [
  {
    title: "Module launchpad",
    body: "Future ERP areas are staged here as placeholders with a clear path to business implementation.",
  },
  {
    title: "Release readiness",
    body: "Build, lint, test, and container orchestration hooks are prepared for a clean delivery pipeline.",
  },
  {
    title: "Accessibility first",
    body: "Semantic structure, contrast-safe tokens, and RTL/LTR support are already part of the shell.",
  },
];

export function OverviewPage() {
  return (
    <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
      <div className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-3">
          {panels.map((panel) => (
            <article
              key={panel.title}
              className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h3 className="text-lg font-semibold">{panel.title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{panel.body}</p>
            </article>
          ))}
        </div>

        <article className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">Module roadmap</p>
              <h3 className="mt-2 text-2xl font-semibold">Foundation-only view</h3>
            </div>
            <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              No business screens
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              "Authentication",
              "Users",
              "Roles",
              "Permissions",
              "HR",
              "Payroll",
              "Accounting",
              "Inventory",
              "Reports",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item}</div>
                <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Placeholder folder ready for implementation.</div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <aside className="space-y-6">
        <article className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">System health</p>
          <div className="mt-4 space-y-3">
            {[
              ["Backend", "Ready"],
              ["Database", "Provisioned"],
              ["Redis", "Provisioned"],
              ["RabbitMQ", "Provisioned"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3 dark:bg-zinc-950"
              >
                <span className="text-sm text-zinc-600 dark:text-zinc-300">{label}</span>
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-300">{value}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">Project notes</p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            <li>Clean Architecture and modular monolith boundaries are scaffolded.</li>
            <li>Frontend supports RTL/LTR direction switching and theme persistence.</li>
            <li>Docker, Maven Wrapper, ESLint, Prettier, Checkstyle, and Spotless are prepared.</li>
          </ul>
        </article>
      </aside>
    </section>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd "/home/omar/new project/frontend" && npx tsc --noEmit -p tsconfig.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd "/home/omar/new project/frontend" && git add src/pages/OverviewPage.tsx
git commit -m "style: restyle OverviewPage to flat zinc+emerald"
```

---

### Task 5: BrandMark, ModeSwitch, LocaleSwitch restyle

**Files:**
- Modify: `frontend/src/components/BrandMark.tsx` (full file)
- Modify: `frontend/src/components/ModeSwitch.tsx` (full file)
- Modify: `frontend/src/components/LocaleSwitch.tsx` (full file)

**Interfaces:**
- Consumes: nothing new — same props/signatures as before (`ModeSwitchProps`, `LocaleSwitchProps` unchanged), already consumed by `AppShell.tsx` from Task 3.
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Replace `frontend/src/components/BrandMark.tsx`**

```tsx
export function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500 text-sm font-bold text-white">
        ERP
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-[0.18em] text-zinc-800 dark:text-zinc-200">ENTERPRISE</div>
        <div className="text-base font-medium text-zinc-500 dark:text-zinc-400">Foundation Console</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `frontend/src/components/ModeSwitch.tsx`**

```tsx
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
```

- [ ] **Step 3: Replace `frontend/src/components/LocaleSwitch.tsx`**

```tsx
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
```

- [ ] **Step 4: Verify — this is the last file touched, no more `brand-*`, `shadow-soft`, `shadow-lift`, `backdrop-blur` should remain anywhere in `src/`**

Run: `cd "/home/omar/new project/frontend" && npx tsc --noEmit -p tsconfig.json && grep -rn "brand-\|shadow-soft\|shadow-lift\|backdrop-blur" src/ ; echo "grep exit: $?"`
Expected: `tsc` PASS, then `grep` finds nothing (grep exit code 1, printed as "grep exit: 1")

- [ ] **Step 5: Commit**

```bash
cd "/home/omar/new project/frontend" && git add src/components/BrandMark.tsx src/components/ModeSwitch.tsx src/components/LocaleSwitch.tsx
git commit -m "style: restyle BrandMark, ModeSwitch, LocaleSwitch to flat zinc+emerald"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Run full lint + build**

Run: `cd "/home/omar/new project/frontend" && npm run check`
Expected: PASS (both `eslint . --max-warnings=0` and `tsc --noEmit && vite build` succeed)

- [ ] **Step 2: Start dev server for manual visual check**

Run: `cd "/home/omar/new project/frontend" && npm run dev`
Expected: server starts, prints local URL (e.g. `http://localhost:5173`)

- [ ] **Step 3: Manual check in browser**

Open the dev server URL and confirm:
- Dark mode (default if system prefers dark, or toggle via the theme button): flat zinc-950/zinc-900 surfaces, emerald accents, no blur, no glow, 10px corners.
- Light mode (toggle theme button): flat zinc-50/white surfaces, emerald accents, same flat treatment — this previously did nothing visually (the old hardcoded gradient background ignored the theme toggle); confirm it now actually changes the shell.
- Locale toggle (AR button): sidebar nav shows Arabic group labels (الوصول، الموظفون، المالية، العمليات، النظام) and the whole layout mirrors to RTL correctly.
- Sidebar nav shows 5 labeled groups (Access, People, Finance, Operations, System) plus the ungrouped Dashboard link at top, not one flat 15-item list.
- Resize to mobile width: layout still stacks sensibly (sidebar above/below main content per existing responsive grid).

Stop the dev server (Ctrl-C) once confirmed.

- [ ] **Step 4: Update CLAUDE.md status log**

Add a new dated entry to the Status Log in `/home/omar/new project/CLAUDE.md` noting the shell restyle plan is implemented, merged into `v1`, and what the next sub-project should be (pick the next ERP module, e.g. Authentication, following the same brainstorm → spec → plan → implement cycle).

- [ ] **Step 5: Commit CLAUDE.md update**

```bash
cd "/home/omar/new project" && git add CLAUDE.md
git commit -m "docs: update status log after shell UI restyle"
```
