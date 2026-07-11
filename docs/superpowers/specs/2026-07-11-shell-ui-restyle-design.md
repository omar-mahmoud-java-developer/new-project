# Shell UI Restyle — Design

## Purpose

Restyle the existing dashboard shell (`AppShell`, `OverviewPage`, sidebar navigation) from its current dark-glass/blue-brand look to a dark high-contrast, flat, zinc/black + emerald visual direction. This is sub-project 1 of the broader ERP build — a pure frontend visual pass with no backend or business-logic changes. It exists so the shell is finalized before any real ERP module (Authentication, HR, etc.) is built on top of it.

## Context

The frontend already has a working shell: `AppShell.tsx` (header, sidebar, main content grid), `OverviewPage.tsx` (metrics, module placeholder grid, system health panel), `navigation.ts` (flat list of 15 nav items), `copy.ts` (EN/AR strings), and Tailwind tokens in `tailwind.config.ts` / `global.css` defining a blue brand palette with heavy rounding (1.75rem) and glassmorphism (backdrop-blur, glow shadows). No business modules exist yet — everything under the module grid is a labeled placeholder.

Options were explored via the brainstorming visual companion (mockups of current shell, three style directions, font comparison, radius comparison, nav grouping comparison). Decisions below reflect the user's selections through that process.

## Decisions

### Palette

Replace the blue brand + glass tokens with a zinc/black + emerald palette:

- Surfaces: zinc/black (`#09090b`, `#18181b` family) instead of the current slate-900/blue-tinted radial gradient background.
- Accent: emerald (`#34d399` family) replaces the blue `brand` scale for status badges, active nav state, and key metrics.
- Remove `backdrop-blur-xl` and the `shadow-soft` / `shadow-lift` glow shadows. Surfaces become flat with a thin 1px border (`border-zinc-800` equivalent) instead of glass + glow.

### Radius

Global corner radius drops from the current 28px (`rounded-[1.75rem]`) to 10px across cards, panels, nav items, and buttons. Applies everywhere `rounded-[1.5rem]` / `rounded-[1.75rem]` / `rounded-2xl` / `rounded-full` badges currently appear in `AppShell.tsx` and `OverviewPage.tsx` — badges can stay pill-shaped (`rounded-full`) since that's a shape choice, not part of the "heavy rounding" being removed.

### Typography

No change. Manrope stays as the body/heading font — the user chose to keep it over switching to Inter, since the rounded font against the new sharper flat UI still reads fine and adds warmth.

### Navigation grouping

`navigation.ts` changes from a flat `{ label, icon }[]` array to a grouped structure:

```ts
export const navigationGroups = [
  { group: null, items: [{ label: "Dashboard", icon: LayoutDashboard }] },
  { group: "access", items: [Authentication, Users] },
  { group: "people", items: [HR, Attendance, Payroll] },
  { group: "finance", items: [Accounting, Expenses] },
  { group: "operations", items: [Inventory, Manufacturing] },
  { group: "system", items: [Notifications, Email, Reports, Audit, Documents] },
];
```

Group labels need EN/AR entries added to `copy.ts` (e.g. `navGroups: { access: "Access", people: "People", ... }` per locale — Arabic translations to be added alongside). `AppShell.tsx`'s nav rendering changes from a single `.map` over a flat array to a nested map over groups, with an uppercase small-caps group label (matching the existing `text-xs uppercase tracking-[0.3em] text-slate-400` pattern already used elsewhere in the shell) preceding each group's items. The `Dashboard` item stays ungrouped at the top, no label above it.

### Out of scope

- No backend changes.
- No new routes/pages — `OverviewPage` keeps its current sections (metrics, module placeholder grid, system health, project notes), just restyled to the new palette/radius.
- No changes to `ModeSwitch` / `LocaleSwitch` behavior — only their visual styling follows the new palette.
- No changes to RTL/LTR logic, theme persistence logic, or `uiStore.ts` state shape.

## Components touched

- `frontend/tailwind.config.ts` — replace `brand` color scale with `accent` (emerald) scale; adjust `borderRadius` tokens.
- `frontend/src/styles/global.css` — update `--surface` / `--surface-alt` / `--outline` CSS variables for zinc/black instead of slate/blue; drop the radial gradient background in favor of flat zinc background.
- `frontend/src/layouts/AppShell.tsx` — restyle header/sidebar/main containers (remove blur/glow, apply new radius), switch nav rendering to grouped structure.
- `frontend/src/pages/OverviewPage.tsx` — restyle cards/panels to new palette and radius.
- `frontend/src/app/navigation.ts` — restructure to grouped array.
- `frontend/src/app/copy.ts` — add `navGroups` translations (EN/AR).

## Testing / verification

No business logic, so no unit tests apply. Verification is manual and visual:

- `npm run dev`, check the shell in both themes (dark/light toggle) and both locales (EN/AR, confirming RTL mirrors correctly with the new grouped nav).
- Check responsive behavior at mobile width (sidebar/grid stacking already exists — confirm it still holds with new styling).
- `npm run lint` and `npm run build` pass clean.

## Future work

- Once a real module (e.g. Authentication) is built, its nav item becomes a live link instead of a placeholder `href="#"` — out of scope here.
- Component-level design system documentation (`docs/04_Frontend/DESIGN_SYSTEM.md`) is still a TODO stub; could be filled in with the finalized tokens after this restyle lands, but that's a separate task.
