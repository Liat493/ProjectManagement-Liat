# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/index.ts` (Drizzle). Includes `riskAlertsTable`.
- API contract (source of truth): `lib/api-spec/openapi.yaml`. Run codegen after editing (see Run & Operate).
- Generated client hooks/types: `@workspace/api-client-react`; server Zod schemas: `@workspace/api-zod`.
- API routes: `artifacts/api-server/src/routes/*` (registered in `routes/index.ts`, ownership-scoped via `ownStudentParam`).
- Risk Alerts engine: `artifacts/api-server/src/lib/alerts.ts`; routes in `routes/alerts.ts`.
- Frontend pages: `artifacts/student-analytics/src/pages/*`; nav in `components/layout.tsx`; routes in `App.tsx`.

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

Student-side academic analytics ("Smart Learning System"). Capabilities:
- Dashboard with key stats (overall average, submission rate, attendance, due-this-week) + module shortcuts.
- Grade Averages, Class Comparison, Submission Rate, Weekly Schedule.
- Risk Alerts (Sprint 3): early-warning engine over existing grades/attendance/submissions/assignments. Alert types map to user stories — US1 low grade, US2 low attendance, US3 declining grade trend, US4 missing/late submission, US5 high-risk course (composite risk score). Every alert carries a recommendation (US7). Persistent history with resolve/dismiss/reactivate; dashboard widget + Alert History page with filter/sort/pagination (US6).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- DB schema changes: `drizzle-kit push` needs a TTY and fails non-interactively here. Apply DDL via raw SQL (executeSql) and keep `lib/db/src/schema/index.ts` in sync.
- After editing `lib/api-spec/openapi.yaml`, re-run codegen AND add matching type re-exports to the `@workspace/api-zod` barrel (`lib/api-zod/src/index.ts`) — they are not auto-generated.
- Risk alerts dedupe/persistence relies on the unique index `(student_id, alert_type, related_key)` + `onConflictDoNothing`. `related_key` must be a stable identifier (e.g. `grade:{id}`, `missing:{assignmentId}`) so resolved/dismissed alerts are never recreated.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
