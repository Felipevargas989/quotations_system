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
- `frontend/` — React 18 + Vite + TypeScript SPA, deployed on Railway.

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
basic file hygiene. ESLint/type-check hooks are intentionally commented out, so those are not
enforced — run lint/type-check manually before committing. **The backend unit tests, however,
ARE enforced in CI** (see the release pipeline and _Testing_ below): they run on every PR to
`main` and must pass before a merge, so run `npm test` in `api-rest/` before pushing.

### Testing

The backend is covered by Jest unit tests — one `*.spec.ts` per source file, under each
module's `tests/` folder. They are **pure unit tests**: the class under test is built with
`Test.createTestingModule` and **every dependency is mocked** (`jest.Mocked` + `useValue`) —
repositories, sibling services, `PinoLogger`, `SupabaseService` (a chainable query-builder
mock), `ConfigService`, `Reflector`; the `resend` and `@supabase/supabase-js` packages are
`jest.mock`'d. No real database, network, or secrets are ever touched. Reference examples:
`src/services/tests/*` and `src/quotations/tests/unit/quotations.service.spec.ts`.

- **When you touch backend code, add or update its unit tests in the same change.** A new or
  modified controller/service/repository/cron service must have a matching `*.spec.ts` that
  covers the new behavior (happy path, `company_id` scoping, error branches, delegation).
- Keep the suite green — `npm test` (in `api-rest/`) must pass. CI enforces this before merge.

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
- **External data**: services pull product/service catalogs from Google Sheets
  (`googleSheetsService.ts`, `useGoogleSheets`) and read/write `.xlsx` via `xlsx`.

Frontend env (`frontend/.env`, see `.env.example`, all `VITE_` prefixed): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_EVENTIA_API_REST` (backend base URL), plus the
`VITE_GOOGLE_*` Sheets keys.

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
- Migrations can be applied two ways:
  - **Manually** in Supabase (SQL editor) — still valid for hotfixes/local checks. When you add
    a migration this way, **explicitly tell the user they must run the SQL in the DB provider.**
    Never assume a migration has been applied.
  - **Automatically on release** via the pipeline below (the normal path). Either way, never
    edit a migration after it has been applied — add a new numbered one instead.

### CI (`.github/workflows/ci.yml`)

Runs on every **PR to `main`** (and pushes to `main`): installs `api-rest/` deps and runs the
backend Jest suite (`npm test`). It needs no secrets/DB/network (all deps are mocked). `main` is
protected by a branch ruleset that **requires this `Backend unit tests` check to pass — plus one
review — before a PR can merge**, so a red suite blocks the merge.

### Automated release pipeline (`.github/workflows/release.yml`)

When a PR is merged into `main`, an ordered GitHub Actions pipeline releases the whole system:

0. **test** — runs the backend Jest suite (`npm test` in `api-rest/`). Every later step
   `needs` it, so a failing suite blocks the migration and both deploys, even on a direct push.
1. **migrate** — `docs/migrations/run-migrations.mjs` applies pending `docs/migrations/*.sql`
   to Supabase, tracking applied files in a `public.schema_migrations` table (idempotent; runs
   each file once, inside a transaction; migration runs before its `.backfill.sql`;
   `0_initial_models.sql` is skipped). Only if step 0 succeeded.
2. **backend** — deploys `api-rest/` to Railway via `railway up` (only if step 1 succeeded).
3. **frontend** — deploys `frontend/` to Railway via `railway up` (only if step 2 succeeded).

Both apps run on Railway. This pipeline **replaces Railway's "deploy on push" trigger** — it
pushes the code itself so it can sequence DB → backend → frontend. If you leave Railway's
auto-deploy on, Railway will deploy the code in parallel with (or before) the migration and the
ordering is lost.

Because the DB is migrated **before** the new code runs, migrations must stay
**backward-compatible** with the currently-deployed code for the window between steps 1 and 3.
Use expand/contract: add columns/tables first; drop or rename in a *later* release after the
code no longer uses them.

Operational requirements (one-time setup, see the header of `release.yml`):
- Repo secrets: `SUPABASE_DB_URL`, `RAILWAY_TOKEN` (the Railway service IDs are non-secret and
  hardcoded as `env` in `release.yml`).
- **Turn OFF Railway's automatic GitHub deploy on both services** so the pipeline controls
  ordering instead of Railway racing the migration step.
- On a DB whose existing migrations were applied by hand, run the runner once with `--baseline`
  (`npm run migrate:baseline` in `docs/migrations/`) to mark them applied without re-executing.
- To apply migrations manually / preview: `cd docs/migrations && npm ci && SUPABASE_DB_URL=... npm run migrate` (or `migrate:dry-run`).

## Git & PR workflow

- **Never commit or merge directly to `main`.** All work happens on a feature branch following
  common conventions: `feature/<short-descriptive-name>` (e.g. `feature/add-service-discounts`).
- **Prefix every commit message with the area of the change** in square brackets:
  `[database]`, `[backend]`, or `[frontend]` — e.g. `[database] add migration for service discounts`.
  If a commit spans multiple areas, prefer splitting it; otherwise list the areas.
- When a feature is ready, **open a PR from the feature branch targeting `main`** (follow common
  PR conventions). Merging into `main` always goes through a PR — direct merges are not allowed.
- **A PR can only merge once the `Backend unit tests` CI check passes and it has one approving
  review** — enforced by the `main` branch ruleset. So any change that touches the backend must
  include passing unit tests for it (see _Testing_). If a PR predates the CI workflow, update its
  branch with `main` so the check can run.
