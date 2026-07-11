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
- **Next step**: user reviewing the spec. Once approved, invoke `writing-plans` skill to turn it into an implementation plan, then implement (touches `tailwind.config.ts`, `global.css`, `AppShell.tsx`, `OverviewPage.tsx`, `navigation.ts`, `copy.ts`).

## Conventions

- Design specs live in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, one per sub-project.
- Each sub-project follows: brainstorm (spec) → writing-plans (plan) → implementation → commit.
- Don't build multiple ERP modules in parallel specs — decompose, finish one, move to the next.
