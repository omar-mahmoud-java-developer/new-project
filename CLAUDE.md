# Project Context

Enterprise ERP platform — modular monolith. Java 21 / Spring Boot backend, React / Vite / Tailwind frontend, PostgreSQL / Redis / RabbitMQ, Docker Compose. See `README.md` and `docs/` for the full doc portal.

This file is read automatically at the start of every Claude Code session in this directory. Its job is continuity across sessions — read the Status Log below before starting work, and append to it before ending a session or after finishing a meaningful chunk of work.

## How to resume a session

1. Read the Status Log below (most recent entry = current state).
2. Check `docs/superpowers/specs/` for design specs — each is a self-contained sub-project spec.
3. Check `git log` for what actually landed vs. what's only spec'd.
4. Continue from "Next step" in the latest log entry.

## Status Log

### 2026-07-11

- Explored existing scaffold: ERP foundation is fully scaffolded (backend module structure, frontend shell, docs portal, Docker Compose) but has **zero business logic** — no modules implemented yet, docs are TODO stubs.
- Decided approach: build one module/sub-project at a time via brainstorm → spec → plan → implement cycle (superpowers skill flow), starting with the frontend shell itself before any business module.
- Ran brainstorming session (with visual companion) for **sub-project 1: shell UI restyle**. Decisions locked: dark high-contrast palette (zinc/black + emerald, replacing blue/glass), 10px corner radius (down from 28px), keep Manrope font, group sidebar nav into sections (Access / People / Finance / Operations / System).
- Design spec written and committed: `docs/superpowers/specs/2026-07-11-shell-ui-restyle-design.md`.
- Implementation plan written and committed: `docs/superpowers/plans/2026-07-11-shell-ui-restyle.md` (6 tasks).
- Created branch `v1` off `main` for implementation.

### 2026-07-12

- Executed the shell-restyle plan via subagent-driven-development (fresh implementer + reviewer subagent per task, all 6 tasks approved clean on first or near-first review). Commits on `v1`: `a17dc00` (Tailwind tokens/global CSS) → `09b4453` (grouped nav data + EN/AR translations) → `a983543` (AppShell restyle + grouped nav rendering) → `e4d264a` (OverviewPage restyle) → `e40d933` (BrandMark/ModeSwitch/LocaleSwitch restyle).
- Verified end-to-end with a headless-Chromium script (Playwright, no project run-skill existed yet for this app): `npm run check` green, zero console errors, screenshots confirm dark AND light modes now both render correctly (previously light mode was visually a no-op — the old hardcoded gradient background ignored the theme toggle; this is now fixed as a side effect of switching to `dark:`-variant Tailwind classes), RTL/AR grouped nav labels correct, mobile viewport stacks correctly.
- Shell UI restyle sub-project is implementation-complete on branch `v1`, pending final whole-branch code review, then `finishing-a-development-branch` (merge/PR decision — not yet done, needs user).
- **Next step**: run final whole-branch review on `v1`, then ask the user how to integrate (merge to `main` / PR / keep as-is) via `finishing-a-development-branch`. After that, pick sub-project 2 — the next ERP module (e.g. Authentication) — and repeat the brainstorm → spec → plan → implement cycle.

## Conventions

- Design specs live in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, one per sub-project.
- Each sub-project follows: brainstorm (spec) → writing-plans (plan) → implementation → commit.
- Don't build multiple ERP modules in parallel specs — decompose, finish one, move to the next.
