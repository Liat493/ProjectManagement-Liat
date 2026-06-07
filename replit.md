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
- Heatmap Analytics (Sprint 4): helpers in `artifacts/api-server/src/lib/heatmap.ts`; route in `routes/heatmap.ts`; frontend `pages/heatmap.tsx`.
- Habit Tracking (Sprint 5): compute + alert engine in `artifacts/api-server/src/lib/habits.ts`; route in `routes/habits.ts`; frontend `pages/habits.tsx`. Tables `studySessionsTable` + `studyHabitAlertsTable`. Demo seeder `ensureDemoStudySessions` in `lib/seed-demo.ts`.
- Smart Recommendations (Sprint 6): generation + improvement engine in `artifacts/api-server/src/lib/recommendations.ts`; route in `routes/recommendations.ts`; frontend `pages/recommendations.tsx`. Table `recommendationsTable`. No new seeder — recs derive from existing data on read.
- Frontend pages: `artifacts/student-analytics/src/pages/*`; nav in `components/layout.tsx`; routes in `App.tsx`.

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

Student-side academic analytics ("Smart Learning System"). Capabilities:
- Dashboard with key stats (overall average, submission rate, attendance, due-this-week) + module shortcuts.
- Grade Averages, Class Comparison, Submission Rate, Weekly Schedule.
- Risk Alerts (Sprint 3): early-warning engine over existing grades/attendance/submissions/assignments. Alert types map to user stories — US1 low grade, US2 low attendance, US3 declining grade trend, US4 missing/late submission, US5 high-risk course (composite risk score). Every alert carries a recommendation (US7). Persistent history with resolve/dismiss/reactivate; dashboard widget + Alert History page with filter/sort/pagination (US6).
- Heatmap Analytics (Sprint 4): read-only heatmap over existing attendance/grades/class-averages. Rows = courses, columns = term months (derived from attendance, see Gotchas). US1 attendance heatmap (intensity by attendance %), US2 strong / US3 weak courses (per-course overall weighted avg vs the student's own overall avg, ±5 threshold; row badges), US4 shared 5-level scale (Excellent/Good/Average/Needs-work/Weak) with legend + non-color symbol cues, US5 client-side Attendance/Grades view toggle (no refetch), US6 class-average comparison column + tooltips (your avg, class avg, diff) reusing `classAveragesTable`, US7 data-derived Recommendations panel (weak courses, <80% attendance, strong-course reinforcement). Loading/error/empty states. No DB or grade-data mutations — purely additive.
- Smart Recommendations (Sprint 6): personalised, data-generated suggestions derived from existing data (grades, attendance, assignments/submissions, active risk alerts and study-habit alerts, plus Heatmap weak-area logic). Additive only — no existing feature or table is altered. One rich `GET /recommendations/{studentId}` (active recommendations + per-course improvement trends + course list for the filter + `hasData`) drives client-side course filtering (US21, "General" bucket for course-less recs); `PATCH /recommendations/{studentId}/items/{recommendationId}` sets status active/completed/dismissed. Generators: US15 low_grade (latest grade per course below 70, auto-completes on recovery), US16 weak_topic (low average per grade type), US36 weak_course (Heatmap `courseStrength`==='weak') + low_attendance (<75%), US17 low_submission (<80% of past-due assignments) + habit_followup (one per active study-habit alert), US50 risk_followup (one per active risk alert, reusing its recommendation text). US18 every rec carries a concrete data-derived reason. US19 dedupe + relevance via the unique index + upsert (see Gotchas). US20 improvement tracking compares each course's earlier-half vs later-half grade averages → improving/stable/declining. Loading/error/empty states; safe empty message when the student has no academic data.
- Habit Tracking (Sprint 5): study-habit analytics derived from a new `study_sessions` table plus existing assignments/submissions. Single rich `GET /habits/{studentId}` payload drives client-side selectors (no refetch); `PATCH /habits/{studentId}/alerts/{alertId}` dismisses alerts. US1 daily summary (today's minutes/sessions/avg/last activity), US2 weekly consistency (active vs inactive days, current streak, 7-day pattern), US3 average session duration with daily/weekly/monthly period selector, US4 productive hours (hourly distribution + peak hours), US5 submission habits — on-time vs late punctuality lens reusing assignments/submissions (distinct from Submission Rate %), with a course filter, US6 trends (14-day/8-week/6-month) with range selector, US7 inconsistency alerts (inactivity, duration drop, consistency decline) with dismiss. Separate `study_habit_alerts` table so Risk Alerts is untouched. Loading/error/empty states. Additive only — no mutations to existing academic tables.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- DB schema changes: `drizzle-kit push` needs a TTY and fails non-interactively here. Apply DDL via raw SQL (executeSql) and keep `lib/db/src/schema/index.ts` in sync.
- After editing `lib/api-spec/openapi.yaml`, re-run codegen AND add matching type re-exports to the `@workspace/api-zod` barrel (`lib/api-zod/src/index.ts`) — they are not auto-generated.
- Risk alerts dedupe/persistence relies on the unique index `(student_id, alert_type, related_key)` + `onConflictDoNothing`. `related_key` must be a stable identifier (e.g. `grade:{id}`, `missing:{assignmentId}`) so resolved/dismissed alerts are never recreated.
- Habit alerts (`study_habit_alerts`) use a DIFFERENT lifecycle from Risk Alerts: each `GET /habits` recomputes which inconsistencies currently hold, then in `generateHabitAlerts` (1) auto-resolves any `status='active'` row whose `related_key` is no longer firing (so the list never shows stale alerts) and (2) upserts current ones with `onConflictDoUpdate` + `setWhere status='resolved'` — this reactivates a previously auto-resolved alert but deliberately leaves user-`dismissed` alerts dismissed. Weekly alert keys are scoped by ISO week (`isoWeekKey`); inactivity keys by the last active day. Don't switch this to `onConflictDoNothing` — that would lose auto-resolution and reactivation.
- Demo seeding: `ensureDemoUser()` returns the effective demo `studentId` (it may not be `1` if the seed student isn't present); always pass that into `ensureDemoStudySessions(studentId)` rather than hardcoding an id.
- Recommendations lifecycle (`recommendations` table) is reconciled on every `GET /recommendations`: (1) any `status='active'` row whose condition no longer fires is auto-completed (`status='completed'`, `auto_completed=true`); (2) current candidates are upserted with `onConflictDoUpdate` keyed on the unique `(student_id, recommendation_type, related_key)` index. The `setWhere` is `status='active' OR auto_completed=true` — this refreshes title/message/reason/priority for still-active recs (US19 relevance) AND reactivates previously auto-completed ones, while deliberately leaving manually `completed`/`dismissed` rows (`auto_completed=false`) untouched so a student's explicit choice is never resurrected. A manual `PATCH` always sets `auto_completed=false`. Do NOT narrow `setWhere` back to only `auto_completed=true` — active rows would then go stale; do NOT switch to `onConflictDoNothing` — you'd lose both refresh and reactivation. `related_key` must be stable: `course:{id}` (low_grade/weak_course/low_attendance/low_submission), `course:{id}:type:{gradeType}` (weak_topic), `alert:{id}` (risk/habit followups). Uniqueness includes the type, so the same `course:{id}` across different types does not collide.
- Collapsing same-content cards (rows that share content but have different `related_key`s, e.g. several `risk_followup` recs for one low grade): for recommendations this is done inside `generateRecommendations` and MUST be lifecycle-aware — load `existing` first, group candidates by `type|courseId|message|reason`, emit one canonical per group ranked active > new > auto_completed > manually-dismissed. A naive "keep first" collapse can pick a dismissed row as canonical and silently hide a still-valid card. For Risk Alerts there is deliberately NO content filter in `generateAlerts` (it has no reconcile/auto-resolve to recover a dropped candidate); rely on the unique index + deleting orphan rows whose source item was deleted.
- Heatmap columns are term-scoped on purpose: the term starts at the earliest attendance month, and only attendance + grade months from that point on become columns (historical grades from prior terms are intentionally excluded so the grid stays readable). Strong/weak badges and the class-comparison column use the course's overall weighted average across ALL grades, so they are unaffected by this column windowing. If a student has no attendance at all, columns fall back to grade months so the grades view still renders.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
