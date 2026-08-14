# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A multi-tenant SaaS for event-business quotations ("cotizaciones"). A company creates
quotations/requirements for clients, builds them from fixed + variable services (optionally
grouped into reusable service groups and packages), tracks payments/refunds, and views
analytics. The product is branded **Eventia** (frontend package `eventia-cotizaciones`).
The codebase and UI are largely in Spanish.

Two independently-deployed apps in one repo:

- `api-rest/` — NestJS 11 REST API (the backend).
- `frontend/` — React 18 + Vite + TypeScript SPA, deployed on Netlify.

There is **no shared package**; the two apps communicate only over HTTP and share a Supabase
(Postgres) database.

## Commands

Run from `startApi.sh` / `startFront.sh` at the root, or directly in each subdir:

**Backend (`api-rest/`)** — Node >= 20:
- `npm run start:dev` — watch-mode dev server (port from `PORT` env, default 3000)
- `npm run build` / `npm run start:prod`
- `npm run lint` — ESLint with `--fix`
- `npm run test` — all Jest unit specs (`*.spec.ts` under `src/`)
- `npm run test:unit` — uses `testConfig/jest.unit.config.js`
- `npm run test:cov` / `npm run test:e2e`
- Run a single test file: `npm run test -- src/quotations/tests/unit/quotations.service.spec.ts`
- Run by name: `npm run test -- -t "creates a payment"`

**Frontend (`frontend/`)**:
- `npm run dev` — Vite dev server (port 5173)
- `npm run build` — `tsc && vite build` (type-checks then builds; `build:skip-ts` skips tsc)
- `npm run lint` — ESLint, `--max-warnings 0`
- There is no frontend test suite.

**Pre-commit** (`.pre-commit-config.yaml`) only runs Prettier `format` on each subdir plus
basic file hygiene. ESLint/type-check/test hooks are intentionally commented out, so CI does
not enforce them — run lint/tests manually before committing.

## Backend architecture

Each feature is a NestJS module under `src/<feature>/` following a strict 4-layer pattern:

- **Controller** (`*.controller.ts`) — routes, DTO validation, extracts the auth user.
- **Service** (`*.service.ts`) — business logic.
- **Repository** (`*.repository.ts`) — the ONLY layer that touches Supabase. Every repo method
  takes `companyId` and filters/scopes queries by `company_id` (see `clients.repository.ts`).
- **DTOs / entities / interfaces / types** — validated with `class-validator` + `class-transformer`.

Modules: `auth`, `companies`, `users`, `clients`, `quotations`, `payments`, `refunds`,
`services`, `service-groups`, `service-group-collections` (packages/"paquetes"), `plans`,
`calendar`, `analytics`, `super-admin`, `email`, `customer_satisfaction_survey`.

Cross-cutting:
- **Database**: `SupabaseService` (`src/supabase/`) is the single client. It uses the
  **service-role key** and bypasses RLS — therefore tenant isolation is enforced in application
  code via the `company_id` filter in repositories, NOT by the database. Preserve this when
  adding queries.
- **Auth**: `AuthGuard` (`src/auth/auth.guard.ts`) is registered globally via `APP_GUARD`. It
  validates the Supabase JWT `Bearer` token, loads the full user, and attaches
  `{ id, company_id }` to `request.user`. Every route is protected by default; mark public
  endpoints (e.g. public quotation creation, lead capture) with the `@Public()` decorator
  (`src/auth/public.decorator.ts`). Read the user in controllers via the `@User()` decorator.
- **Validation**: a global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, and
  `transform` is set in `main.ts` — unknown body fields are rejected.
- **Logging**: `nestjs-pino` (`PinoLogger`, set context per class). Repositories log each query.
- **Cron**: `ScheduleModule` is enabled only when `NODE_ENV === 'production'`. Scheduled jobs
  live in `*-cron.service.ts` (e.g. `quotations-cron.service.ts`, `analyitics-cront.service.ts`).
- **Email**: `EmailModule` uses Resend (`RESEND_API_KEY`).

Backend env (`api-rest/.env`, see `.env.example`): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL`, `FRONTEND_URL`, `PORT`,
`RESEND_API_KEY`, `SUPER_ADMIN_EMAILS` (comma-separated allowlist for the super-admin area).

## Frontend architecture

- **API access**: all backend calls go through `src/services/*.service.ts`, which use the shared
  Axios instance in `src/services/api.ts`. That instance auto-attaches the Supabase JWT and
  transparently refreshes the session / retries once on 401. Endpoint paths are centralized in
  `src/constants/api.routes.ts`. Do not call `axios`/`fetch` directly from components.
- **Auth & state**: Supabase client in `src/lib/supabase.ts` (anon key). `AuthContext`
  (`src/contexts/AuthContext.tsx`) holds the session/user. Data fetching is via per-feature
  hooks in `src/hooks/`.
- **Authorization (RBAC)**: roles `recepcion | vendedor | operaciones | administrador` map to
  visible `Section`s in `src/constants/permissions.ts`. Gate UI with `PermissionGuard`.
- **Routing/layout**: pages in `src/pages/<feature>/`, shell in `src/layout/` (`Layout`,
  `Sidebar`). Some pages are public (landing page, public quotation creation, password
  recovery, public satisfaction survey).
- **Styling**: Tailwind CSS. Icons via `lucide-react`. Charts via `chart.js`/`react-chartjs-2`.
- **External data**: bulk service import reads `.xlsx` via `xlsx` (the old Google
  Sheets integration was removed 2026-07-28 — it was dead code).
## The house kit — REUSE BEFORE YOU WRITE UI

**Rule: before writing any piece of interface, check `src/components/` and
`src/utils/` first.** These pieces already solved the edge cases — a
hand-rolled copy will rediscover them one bug report at a time. This is not
a style preference: on 13-08-2026 a dropdown was hand-rolled next to an
existing one and cost four rounds of corrections (search arguments
inverted, an empty bordered box, the panel pushing the modal's buttons,
and no close-on-click-outside) — every one of them already handled inside
`SelectWithSearch`.

| Piece | Use it for | In |
|---|---|---|
| `components/selects/SelectWithSearch` | **pick ONE value** — arrows/Enter/Escape with the marked option kept in view, opens up when there's no room below, sizes itself against the nearest scroll container, closes on outside click, optional `group` (section headers), `hint`, `dotClass`, `tamano`, `mostrarConteo`; shows the saved label even when it left the catalog | 17 screens |
| `components/selects/AgregadorDeItems` | **ADD several to a list** — never shows the selection, stays open with the cursor in the search box, marks the first row for type+Enter, tall list, always opens downward, controlled `abierto`/`onAbiertoChange` so the screen owns open/close | 4 |
| `hooks/useListaBuscable` | the shared engine of both: filtering, keyboard, keep-in-view, close-on-outside-click. **Fix it here and both pieces get it** | — |
| `components/MultiSelect` | multiple choice with chips | 3 |
| `components/inputs/NumberInput` | any numeric field (Chilean decimal comma, dot→comma) | 16 |
| `components/toast/Toast` | every notice — **never `alert()`/`confirm()`** | 18 |
| `components/ConfirmInline` | confirmations anchored to the button, no browser popups | 10 |
| `components/QuantitySelector` | quantity steppers | 2 |
| `components/PageSkeleton` | loading state of a whole page | 3 |
| `components/PermissionGuard` | gate a route/section by role | — |

Utilities worth knowing before reinventing: `utils/searchMatch`
(`matchesSearch(query, ...targets)` — **query first**, accent/order
insensitive), `utils/dates` (`formatISOUTCDateToString` — event and
due dates are UTC midnight; `new Date()` shifts them a day in Chile),
`utils/phone` (Chilean canonical `+56XXXXXXXXX`), `utils/quotationMoney`
(the single source of truth for quotation totals), `utils/apiErrors`
(`humanizeApiError`), `utils/eventoCongelado` (a realized event is frozen).

**A guard enforces this — `npm run portero`, and a CI step.** Prose in a
doc is a sign, not a barrier: the Calendar filter was hand-rolled next
to `MultiSelect` by someone who never read this section. The guard lives
in `frontend/scripts/portero-kit-de-la-casa.sh` and works like the
backend's lint ceiling — it does not judge today's code, it only stops
each number from GROWING.

It is **generic on purpose**: one `revisar` line per piece, so a new
house component is protected from day one by adding a line — never by
writing a second guard. Ceilings measured 13-08-2026:

| Rule | Ceiling | Reuse instead |
|---|---|---|
| hand-rolled dropdown with a search box | **0** | `SelectWithSearch` / `AgregadorDeItems` |
| native `<select>` | 0 | `SelectWithSearch` |
| hand-rolled floating panel (any) | 15 | `SelectWithSearch` / `MultiSelect` |
| `alert()` | 0 | `Toast` |
| `confirm()` | 0 | `ConfirmInline` |
| native `type="number"` | 0 | `NumberInput` |

**Lowering a ceiling is part of migrating, not a follow-up.** The guard
prints the new numbers when the debt drops; apply them in the same
commit or the ground gained is left free to lose again.

The floating-panel rule is deliberately wider than the others: it is
what would have caught the Calendar multi-select, which has no search
box. It also counts legitimate action menus — that a new panel forces a
moment's pause is the point.

The guard strips comments (with multi-line block state) before
counting, so the half-dozen comments that *mention* `confirm()` or
`<select>` are not miscounted as debt. When adding a rule, only add one
whose hand-rolled form is recognisable by a reliable regex — a guard
with false alarms gets ignored, and then it protects nothing.

When it stops you and neither piece fits, **grow the shared piece** so
all its screens benefit — do not write a copy.

Known debt, measured 13-08-2026 (an earlier count in this file was
wrong — it double-counted a tab bar and missed a dead file):

- **6 hand-rolled dropdowns with search** — `QuotationForm` ×3,
  `ServiciosTab` ×3. These are the literal copies; this number should
  reach zero.
- **1 hand-rolled multi-select** — `Calendar`'s status filter. Its home
  is `MultiSelect`, not `SelectWithSearch`.
- **1 dead file** — `pages/services/components/variableServices/CategorySelector.tsx`,
  169 lines, imported by nobody.

As of 13-08 `SelectWithSearch` carries every feature the copies had
(that is why `group`, `hint`, `dotClass` and `keepOpenOnSelect` exist),
so migrating one is now a straight win rather than a trade-off. Do it
when you touch those screens, validating each, and lower the ceiling in
the guard when you do — otherwise the ground gained is silently
available to lose again.

- **Route-level code splitting**: pages behind login are `React.lazy` in `App.tsx`
  (Suspense fallback `PageLoader`). New authenticated pages must be lazy too.

Frontend env (`frontend/.env`, see `.env.example`, all `VITE_` prefixed): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_EVENTIA_API_REST` (backend base URL).

## Database & migrations

Supabase/Postgres is the single source of truth, shared by both apps. There is **no automated
migration runner** — SQL is applied manually in Supabase. `docs/migrations/0_initial_models.sql`
and `frontend/databaseSchema/database_schema.sql` are context-only snapshots of the full schema
(not meant to be executed). When you change tables, also update the relevant entities/interfaces
in both apps.

**Every DB change MUST be recorded as a migration.** Rules:

- Add a new file under `docs/migrations/` following the existing numbered naming convention:
  `<next-number>_<kebab-or-snake-descriptive-name>.sql` (e.g. `5_add-discount-column.sql`).
  Look at the highest existing number and increment it.
- If the migration needs existing rows to be populated/updated to remain consistent (new
  non-null column, denormalized field, data reshape, etc.), also add a **backfill script**
  alongside the migration whenever it is necessary. Keep it in the same `docs/migrations/`
  folder (e.g. `5_add-discount-column.backfill.sql`) so the schema change and its data fix
  travel together.
- Migrations are **NOT run by this repo or by the app** — they must be executed manually in the
  external DB provider (Supabase). After creating a migration, **explicitly tell the user (or
  the AI running the task) that they must run the SQL command in the DB provider.** Never assume
  a migration has been applied.

## Git & PR workflow

- **Never commit or merge directly to `main`.** All work happens on a feature branch following
  common conventions: `feature/<short-descriptive-name>` (e.g. `feature/add-service-discounts`).
- **Prefix every commit message with the area of the change** in square brackets:
  `[database]`, `[backend]`, or `[frontend]` — e.g. `[database] add migration for service discounts`.
  If a commit spans multiple areas, prefer splitting it; otherwise list the areas.
- When a feature is ready, **open a PR from the feature branch targeting `main`** (follow common
  PR conventions). Merging into `main` always goes through a PR — direct merges are not allowed.
