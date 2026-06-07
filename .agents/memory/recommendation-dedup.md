---
name: Content-dedup for recommendations vs risk alerts
description: Why recommendation near-duplicate collapsing must be lifecycle-aware, and why risk-alert duplicates are handled by data cleanup not a content filter.
---

# Collapsing near-duplicate cards (recommendations & risk alerts)

Two engines can produce several rows that render as the *same card* (e.g. multiple
`risk_followup` recs echoing the same low grade in one course, each keyed by a
different `alert:{id}`). The unique index `(student_id, type, related_key)` does NOT
catch these because the keys differ. Collapsing them needs care.

## Recommendations: collapse must be lifecycle-aware
Rule: group candidates by content signature (`type|courseId|message|reason`), then
emit exactly ONE canonical candidate per group, chosen by rank:
`active(3) > brand-new(2) > auto_completed(1) > manually dismissed/completed(0)`.
Fetch `existing` rows BEFORE deduping so rank can read each candidate's persisted
status.

**Why:** a naive "keep the first candidate" collapse can pick a row the student
manually dismissed as canonical; reconcile then auto-completes the active siblings
and the upsert `setWhere` refuses to reactivate the dismissed canonical → the card
silently vanishes even though the condition still holds. Ranking guarantees an
already-active sibling wins, and a group that is *entirely* manually-dismissed stays
dismissed (no resurrection). Dropped active siblings auto-complete normally because
the canonical represents the same content.

**How to apply:** any time you add content-dedup over candidates that feed an
upsert/auto-complete lifecycle, rank by persisted status — never collapse before
loading existing rows.

## Risk alerts: NO content filter — clean orphans via data
Risk alerts have no reconcile/auto-resolve pass, so a candidate dropped by a content
filter is lost with no recovery. A content-signature filter there also risks
collapsing two genuinely-distinct alerts that coincidentally render identical text.

**Why:** the only real duplicate-content case is an orphan row whose source item
(e.g. a `grade:{id}`) was deleted and recreated under a new id; the unique index
already prevents same-source duplicates. Deleting the orphan row is targeted and
safe; a blanket content filter is overreach.

**How to apply:** rely on the unique `(student_id, alert_type, related_key)` index +
deleting orphan rows. Do not add a content-signature filter to `generateAlerts`.
