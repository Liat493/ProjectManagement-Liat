---
name: Orval hook data typing
description: Two pitfalls when consuming Orval-generated React Query hooks in the student-analytics frontend.
---

# Orval-generated hook typing pitfalls

## 1. Don't type props via `ReturnType<typeof useGetX>["data"]`
Using `NonNullable<ReturnType<typeof useGetX>["data"]>` to type a component prop makes
TypeScript resolve the hook's generic default to `{}`, so every property access errors with
`Property 'foo' does not exist on type '{}'`.

**Fix:** import the concrete generated response interface (e.g. `HabitsReport`,
`HabitSubmissionHabits`, `HabitTrends`) from `@workspace/api-client-react` and annotate props
with those directly. This mirrors how the heatmap page types its sub-components.

**Why:** `ReturnType` on a generic function does not apply the default type argument the way an
actual call site does; it falls back to the unconstrained `{}`.

## 2. Rebuild lib declarations after codegen before the frontend sees new types
After running `pnpm --filter @workspace/api-spec run codegen`, the generated source in
`@workspace/api-client-react` changes but the artifact frontend resolves the lib through its
built `.d.ts`. Run `pnpm run typecheck:libs` (which does `tsc --build`) so the dist declarations
are regenerated; otherwise the frontend typecheck reports the new response type as `{}`/missing
properties even though the source is correct.
