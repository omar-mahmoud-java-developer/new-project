# Authentication Module — Design

## Purpose

Build the Authentication & Access sub-project: user registration, login, session refresh, logout, password reset, and the RBAC (role/permission) data model and enforcement scaffolding that the rest of the ERP will build on. This is sub-project 2 of the ERP build, following the shell UI restyle (sub-project 1, merged to `main`).

## Process note

This spec was written under explicit user authorization to proceed autonomously overnight without interactive brainstorming (no user available to answer clarifying questions in real time). Every non-obvious decision below is a call I made and documented with reasoning, per that authorization, rather than a user-confirmed choice. Flagged explicitly wherever a reasonable alternative existed.

## Context

The backend (`backend/src/main/java/com/enterprise/erp/`) is Spring Boot 3.3.5 / Java 21, already has empty pre-scaffolded packages for exactly this work: `modules/authentication`, `modules/users`, `modules/roles`, `modules/permissions`, plus cross-cutting `security`, `audit`, `shared`, `common` packages — all currently empty (zero `.java` files) except `config/` (`SecurityConfig`, `WebConfig`, `HealthController`) and `ErpApplication`. `SecurityConfig` already sets `SessionCreationPolicy.STATELESS` and a `BCryptPasswordEncoder` bean, with `httpBasic()` as a placeholder to be replaced. This is a strong existing signal (also stated directly in `docs/07_Security/SECURITY.md`'s scope: "JWT and refresh token planning") that JWT, not server-side sessions, is the intended direction — confirmed as the choice below, not a departure from it.

No `.java` test files exist anywhere in `backend/src/test` — this module establishes the testing pattern too. No JWT library is in `pom.xml` yet. `database/migrations` is empty — this module writes the first Flyway migrations. The frontend has an empty `features/` directory and no `services/`/`types/`/`hooks/` content — this module establishes those patterns too. Docker, Postgres, Maven are all available locally in this environment for live verification (not just unit tests) — `docker-compose.yml` already defines `postgres`/`redis`/`rabbitmq` services on their standard ports, currently unused by anything running.

## Decisions

### Auth mechanism: JWT access token + rotating opaque refresh token

Access tokens are short-lived (15 min), stateless, signed JWTs (HS256, secret from `JWT_SECRET` env var with a dev-only fallback default — same pattern already used for `SPRING_DATASOURCE_URL` etc. in `application.yml`). They carry `sub` (user id), `roles`, and standard `iat`/`exp`/`iss` claims, and are validated by a servlet filter with no DB lookup — this is what makes them scale statelessly, matching the existing `SessionCreationPolicy.STATELESS` setting.

Refresh tokens are long-lived (7 days), **opaque random tokens** (not JWTs) stored **hashed** in a `refresh_tokens` table, because a pure-JWT refresh token cannot be revoked before it expires — and revocability is a hard requirement here (logout must actually end a session; password reset must invalidate all of a user's existing sessions). Refresh tokens **rotate on every use**: each refresh call issues a new refresh token and marks the old one's row with `replaced_by_token_id`, leaving `revoked_at` null only on the newest token in the chain. If a client ever presents a token that has already been replaced (reuse of a rotated-out token — a signal of token theft), the whole chain is revoked and the caller must log in again. This is a standard, bounded, testable hardening pattern and was included because it's cheap to implement given the schema already needs a `refresh_tokens` table for revocation.

**Frontend storage split:** the access token lives in memory only (a Zustand store, not persisted to `localStorage`, to avoid XSS-exfiltration of a token that's valid enough to call the API). The refresh token is **never given to JavaScript at all** — the backend sets it as an `HttpOnly`, `Secure`, `SameSite=Strict` cookie on the `/api/auth/login`, `/api/auth/register`, and `/api/auth/refresh` responses, and reads it back the same way. This means a page reload can silently re-authenticate (frontend calls `/api/auth/refresh` on boot, browser sends the cookie automatically) without ever exposing the long-lived credential to script. This is the standard secure pattern for SPA + REST API and was chosen over "both tokens in memory, logged out on refresh" (simpler but bad UX and no better security) and over "both tokens in `localStorage`" (worse security for no benefit).

### Password hashing

Reuse the existing `PasswordEncoder` (`BCryptPasswordEncoder`) bean already defined in `SecurityConfig` — no change needed there.

### RBAC data model — schema now, minimal seed, no fabricated permission catalog

Classic many-to-many: `users` — `user_roles` — `roles` — `role_permissions` — `permissions`. This is the scaffolding the sidebar's grouped nav (Access/People/Finance/Operations/System) implies, but this sub-project does **not** invent a full permission catalog for modules that don't exist yet (People/Finance/Operations have zero business logic today — fabricating `people:manage`-style permissions now would be guessing at a shape we don't know yet, violates YAGNI, and would likely need to change once those modules are actually built). What ships:

- The schema (tables above), extensible by future migrations as each module lands.
- Two seeded roles: `SUPER_ADMIN` and `USER`.
- A minimal, real permission pair that this module itself needs to enforce something end-to-end: `users:manage` and `roles:manage`, both granted to `SUPER_ADMIN` only. This exists to prove the enforcement mechanism (`@PreAuthorize`) actually works, via one protected sample endpoint (`GET /api/auth/users` — list users, `SUPER_ADMIN`-only), not to pre-model permissions for unbuilt modules.
- Future modules add their own permissions via their own migrations when they're built — documented as Future Work below.

### Bootstrap admin: first-ever registration becomes SUPER_ADMIN

No hardcoded default admin credentials are shipped in a migration (a well-known security anti-pattern — shipped default credentials get left in production). Instead: registration checks whether `users` is empty; if so, the new user is granted `SUPER_ADMIN` in addition to `USER`; every subsequent registration gets `USER` only. Known tradeoff: a race between two simultaneous first registrations could both become admin — acceptable for a foundation-phase single-operator bootstrap, not acceptable once this goes further; flagged as Future Work (e.g. a setup-wizard/CLI admin-creation step instead).

### Registration: immediate active account, no email verification gate

`POST /api/auth/register` (email, password, full name) creates an active user immediately and logs them in (returns an access token + sets the refresh cookie), rather than requiring email verification first. Reasoning: email verification requires real outbound email infrastructure (see Password reset delivery below for why that's deferred), and gating registration on it would block using the register flow at all in this environment. Documented as a deliberate foundation-phase simplification and Future Work item, not an oversight.

### Password reset: token flow with a pluggable, swappable delivery port

`POST /api/auth/password-reset/request` (email) — always returns success regardless of whether the email exists (prevents user enumeration), and if it does exist, generates a single-use, 1-hour-lived reset token stored **hashed** in a `password_reset_tokens` table, then hands it to an `EmailSender` interface (`com.enterprise.erp.shared.mail.EmailSender`) to deliver. `POST /api/auth/password-reset/confirm` (token, new password) validates the token (unused, unexpired, hash matches), updates the password, marks the token used, and **revokes all of that user's existing refresh tokens** (forces re-login everywhere — standard practice after a credential change).

The only `EmailSender` implementation shipped in this sub-project is `LoggingEmailSender`, which logs the reset link at INFO level instead of sending real email. Reasoning: `docker-compose.yml` has no mail server (no MailHog/SMTP relay), and adding one is real infrastructure scope beyond "Authentication module" as framed — it's a Future Work item (wire a real `JavaMailSender`-backed implementation once an SMTP relay or provider is chosen). Because delivery is behind an interface, swapping in a real sender later is a single new adapter class, no call-site changes.

### API error model

A minimal `@RestControllerAdvice` (`com.enterprise.erp.shared.web.GlobalExceptionHandler`) maps validation failures (`MethodArgumentNotValidException`) and the specific exceptions this module raises (bad credentials, expired/invalid token, duplicate email) to a consistent JSON error shape (`{ "error": string, "message": string, "timestamp": string }`, matching the existing style of `HealthController`'s `Map.of(...)` responses). This is scoped to what auth needs now; a fuller error model (`docs/06_API/API_GUIDE.md`'s still-TODO "Error model" section) is Future Work once more modules exist to reveal what's actually needed.

### CORS

`SecurityConfig`'s `.cors(Customizer.withDefaults())` is a no-op without a `CorsConfigurationSource` bean. Since refresh relies on a cookie, CORS must allow credentials, which forbids a wildcard origin — a `CorsConfigurationSource` bean is added allowing the Vite dev origin (`http://localhost:5173`, from `VITE_DEV_ORIGIN` env var defaulting to that) with `allowCredentials(true)` and the methods/headers the frontend needs.

### Package layout (follows the existing empty scaffold exactly)

- `com.enterprise.erp.security` — `JwtProvider` (issue/parse/validate access tokens), `JwtAuthenticationFilter`, `CorsConfig`, updates to `SecurityConfig` (replace `httpBasic()` with the JWT filter, wire method security via `@EnableMethodSecurity`).
- `com.enterprise.erp.modules.users` — `User` entity, `UserRepository`. Deliberately thin: this sub-project only needs enough User to authenticate against, not a user-management CRUD API/UI (that's a distinct future module, matching "Users" being its own separate nav item from "Authentication").
- `com.enterprise.erp.modules.roles` — `Role` entity, `RoleRepository`.
- `com.enterprise.erp.modules.permissions` — `Permission` entity, `PermissionRepository`.
- `com.enterprise.erp.modules.authentication` — `RefreshToken`/`PasswordResetToken` entities + repositories, `AuthService`, `PasswordResetService`, `AuthController`, request/response DTOs.
- `com.enterprise.erp.shared.mail` — `EmailSender` interface + `LoggingEmailSender`.
- `com.enterprise.erp.shared.web` — `GlobalExceptionHandler`, `ApiError` DTO.
- `com.enterprise.erp.audit` — **not touched by this sub-project.** It's pre-scaffolded for a future, separate Audit module (its own sidebar nav item under System); stuffing audit logging into Authentication's scope now would blur that boundary.

### Frontend

- `frontend/src/features/auth/` — `LoginPage.tsx`, `RegisterPage.tsx`, `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, plus a small `api.ts` (fetch wrapper: JSON in/out, `credentials: "include"` for the refresh cookie, attaches `Authorization: Bearer <accessToken>` from the auth store, and on a 401 attempts one silent `/api/auth/refresh` + retry before giving up).
- `frontend/src/stores/authStore.ts` — Zustand store (not persisted, matching the access-token-in-memory decision above): `accessToken`, `user` (id/email/name/roles), `status` ("idle"|"authenticating"|"authenticated"|"anonymous"), plus actions wrapping the API calls.
- Routing (`App.tsx`): public routes (`/login`, `/register`, `/forgot-password`, `/reset-password`) outside `AppShell`; everything currently under `AppShell` becomes protected — an unauthenticated user hitting any protected route is redirected to `/login`. On app boot, attempt a silent refresh before deciding anonymous vs authenticated, so a page reload doesn't force a visible flash-then-redirect for an already-logged-in user.
- `AppShell.tsx` gets a logout affordance (button near `ModeSwitch`/`LocaleSwitch` in the header) that calls the store's logout action (calls `/api/auth/logout`, clears in-memory state, redirects to `/login`).
- The sidebar's "Authentication" nav item (`navigation.ts`) stops being a dead `href="#"` placeholder and becomes... on reflection, "Authentication" as a *sidebar destination* doesn't map to a real screen this sub-project builds (login/register/etc. are public pages outside the shell, not a shell-internal screen an already-authenticated user navigates to). Leaving that one nav item as a placeholder is correct for now; a future "Users" nav item pointing at a user-management screen is a better candidate for the first nav item to go live, and that's Users-module scope, not this one. **This is a deliberate scope boundary, not a gap** — documented so it isn't mistaken for missed work.

## Out of scope (Future Work)

- Real email delivery (SMTP relay/provider) for password reset and any future email-verification flow.
- Email verification on registration.
- A user-management CRUD API/UI (`modules.users` beyond what auth needs) and a roles/permissions-management UI — this sub-project ships the *data model*, not admin screens to manage it.
- Per-future-module permissions (People/Finance/Operations/etc.) — added when those modules are built.
- RS256/JWKS key rotation (HS256 shared-secret is the foundation-phase choice; documented as revisitable if/when multiple services need to verify tokens independently).
- Rate limiting / brute-force login protection (`SECURITY.md` scope item, not tackled here — flagged for a dedicated security-hardening pass).
- Audit logging of auth events (belongs to the separate, not-yet-built Audit module).
- A setup-wizard/CLI alternative to the "first registration is admin" bootstrap.

## Testing / verification

Unlike sub-project 1 (pure CSS, no logic), this module is almost entirely logic, so real automated tests are in scope and required — this establishes the project's first test suite:

- **Unit tests** (JUnit 5 + Mockito, `spring-boot-starter-test` already in `pom.xml`): `JwtProvider` (issue/parse/expired/tampered), `AuthService` (registration incl. first-user-is-admin, login success/failure, refresh rotation + reuse detection), `PasswordResetService` (token validity window, single-use, revokes sessions on success).
- **Controller-slice tests** (`@WebMvcTest` + `spring-security-test`, already in `pom.xml`): `AuthController` request validation and status codes, with services mocked.
- **Live verification**: bring up `postgres`/`redis`/`rabbitmq` via `docker compose up -d postgres redis rabbitmq`, run the Flyway migrations, start the Spring Boot app locally (`./mvnw spring-boot:run`), and `curl` through the full flow (register → login → access a protected endpoint → refresh → logout → password-reset request/confirm) to prove it works end-to-end, not just against mocks. This mirrors the "drive the actual running app" verification method used for the shell restyle (headless-Chromium there; `curl` against a real running server here, per the `run` skill's server pattern).
- **Frontend**: headless-Chromium check (same tool/pattern as sub-project 1) driving the real pages — register a user, confirm redirect into the shell, log out, log back in, confirm a bad password shows an error, confirm an unauthenticated visit to `/` redirects to `/login`.

## Future work

See "Out of scope" above — those items are the backlog for a later, dedicated pass, not silently dropped requirements.
