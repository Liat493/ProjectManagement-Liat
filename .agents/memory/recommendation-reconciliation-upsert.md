---
name: Reconciliation upsert setWhere pattern
description: How "regenerate on read" features (recommendations, habit alerts) reconcile persisted rows without resurrecting user choices, and the stale-active-row trap.
---

# Reconciliation upsert pattern (regenerate-on-read engines)

Several student-analytics features (Smart Recommendations, Habit Alerts) recompute
their state on every `GET` and reconcile against a persisted table keyed by a
unique `(student_id, <type>, related_key)` index.

The pattern, per read:
1. Auto-complete/auto-resolve any `status='active'` row whose condition no longer
   fires (mark with a sentinel like `auto_completed=true` / `status='resolved'`).
2. Upsert current candidates with `onConflictDoUpdate`, gated by a `setWhere`.

## The trap
If `setWhere` only matches the auto-completed sentinel (e.g. `auto_completed=true`),
then rows that are **still active** never get their content refreshed when the
underlying data changes but the condition still holds — the recommendation goes
stale (e.g. a `low_grade` rec keeps citing an old grade after a newer low grade
arrives).

## The rule
`setWhere` must be `status='active' OR <sentinel>` so it refreshes still-active rows
AND reactivates auto-completed ones. Setting `status='active'` in the update is
safe for both branches (no-op for already-active). Rows the user **manually**
completed/dismissed carry `auto_completed=false` AND a non-active status, so they
fall outside the `setWhere` and are never resurrected. A manual `PATCH` must always
clear the sentinel (`auto_completed=false`).

**Why:** code review caught that the first implementation used
`setWhere: auto_completed=true` only, which satisfied "don't resurrect dismissed"
but silently broke "keep active recs relevant to latest data".

**How to apply:** any new regenerate-on-read engine in this repo — never use
`onConflictDoNothing` (loses refresh + reactivation), never narrow `setWhere` to the
sentinel alone.
