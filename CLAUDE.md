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
- **External data**: services pull product/service catalogs from Google Sheets
  (`googleSheetsService.ts`, `useGoogleSheets`) and read/write `.xlsx` via `xlsx`.

Frontend env (`frontend/.env`, see `.env.example`, all `VITE_` prefixed): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_EVENTIA_API_REST` (backend base URL), plus the
`VITE_GOOGLE_*` Sheets keys.

## Database & migrations

Supabase/Postgres is the single source of truth, shared by both apps. There is **no automated
migration runner** — SQL is applied manually in Supabase. Track every schema change by adding a
new numbered file under `docs/migrations/` (e.g. `4_<name>.sql`). `docs/migrations/0_initial_models.sql`
and `frontend/databaseSchema/database_schema.sql` are context-only snapshots of the full schema
(not meant to be executed). When you change tables, also update the relevant entities/interfaces
in both apps.
