import {
  db,
  studyHabitAlertsTable,
  studySessionsTable,
  assignmentsTable,
  submissionsTable,
  coursesTable,
  studentCoursesTable,
} from "@workspace/db";
import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import { round2 } from "./business";

// ---------------------------------------------------------------------------
// Learning Habit Tracking (Sprint 5, US1–US7)
//
// All analytics are derived dynamically from `study_sessions` (US1–US4, US6)
// and the existing `assignments`/`submissions` data (US5). Inconsistency
// alerts (US7) are upserted into `study_habit_alerts` using the same
// idempotent (student_id, alert_type, related_key) dedupe pattern as the Risk
// Alerts module — kept in a separate table so Risk Alerts is untouched.
// ---------------------------------------------------------------------------

export type Severity = "low" | "medium" | "high";

// Configurable thresholds for the inconsistency detection (US7).
export const HABIT_CONFIG = {
  // Fire an inactivity alert after this many days with no valid study session.
  inactivityDays: 3,
  // Fire a duration-drop alert when the recent (7-day) average session length
  // falls below this many minutes while there IS recent activity.
  minAvgSessionMinutes: 30,
  // Fire a consistency-decline alert when the current week's active-day count
  // drops by at least this many days versus the prior weeks' average.
  consistencyDropDays: 2,
};

type SessionRow = typeof studySessionsTable.$inferSelect;

/** A session counts only when complete (endedAt set) and positive duration. */
export function isValidSession(s: SessionRow): boolean {
  return (
    s.endedAt != null &&
    typeof s.durationMinutes === "number" &&
    Number.isFinite(s.durationMinutes) &&
    s.durationMinutes > 0
  );
}

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return round2(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface HabitsComputed {
  dailySummary: {
    totalMinutes: number;
    sessionCount: number;
    averageMinutes: number | null;
    lastActivityAt: string | null;
  };
  weeklyConsistency: {
    activeDays: number;
    inactiveDays: number;
    totalDaysStudied: number;
    currentStreak: number;
    pattern: Array<{
      date: string;
      label: string;
      active: boolean;
      minutes: number;
      sessions: number;
    }>;
  };
  averageDurations: {
    daily: number | null;
    weekly: number | null;
    monthly: number | null;
  };
  productiveHours: Array<{
    hour: number;
    totalMinutes: number;
    sessionCount: number;
  }>;
  peakHours: number[];
  trends: {
    daily: Array<{ label: string; minutes: number; sessions: number }>;
    weekly: Array<{ label: string; minutes: number; sessions: number }>;
    monthly: Array<{ label: string; minutes: number; sessions: number }>;
  };
}

/**
 * Compute all study-session derived analytics (US1–US4, US6) from the valid
 * sessions, anchored to `now`.
 */
export function computeHabits(
  sessions: SessionRow[],
  now: Date = new Date(),
): HabitsComputed {
  const valid = sessions
    .filter(isValidSession)
    .map((s) => ({
      started: new Date(s.startedAt),
      minutes: s.durationMinutes as number,
    }))
    .sort((a, b) => a.started.getTime() - b.started.getTime());

  const todayKey = dayKey(now);

  // --- US1: daily summary --------------------------------------------------
  const todays = valid.filter((s) => dayKey(s.started) === todayKey);
  const totalMinutes = todays.reduce((a, s) => a + s.minutes, 0);
  const lastActivity = valid.length ? valid[valid.length - 1]!.started : null;
  const dailySummary = {
    totalMinutes,
    sessionCount: todays.length,
    averageMinutes: avg(todays.map((s) => s.minutes)),
    lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
  };

  // --- US2: weekly consistency (last 7 calendar days incl. today) ---------
  const today0 = startOfDay(now);
  const pattern: HabitsComputed["weeklyConsistency"]["pattern"] = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today0, -i);
    const k = dayKey(d);
    const daySessions = valid.filter((s) => dayKey(s.started) === k);
    const minutes = daySessions.reduce((a, s) => a + s.minutes, 0);
    pattern.push({
      date: k,
      label: WEEKDAYS[d.getDay()]!,
      active: daySessions.length > 0,
      minutes,
      sessions: daySessions.length,
    });
  }
  const activeDays = pattern.filter((p) => p.active).length;

  // All-time distinct active days + current streak.
  const activeDaySet = new Set(valid.map((s) => dayKey(s.started)));
  let currentStreak = 0;
  for (let i = 0; ; i++) {
    const k = dayKey(addDays(today0, -i));
    if (activeDaySet.has(k)) currentStreak++;
    else break;
  }
  const weeklyConsistency = {
    activeDays,
    inactiveDays: 7 - activeDays,
    totalDaysStudied: activeDaySet.size,
    currentStreak,
    pattern,
  };

  // --- US3: average session duration by period ----------------------------
  const within = (days: number) => {
    const cutoff = addDays(today0, -(days - 1));
    return valid.filter((s) => s.started >= cutoff);
  };
  const averageDurations = {
    daily: avg(todays.map((s) => s.minutes)),
    weekly: avg(within(7).map((s) => s.minutes)),
    monthly: avg(within(30).map((s) => s.minutes)),
  };

  // --- US4: productive hours (all-time hourly distribution) ----------------
  const hourBuckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    totalMinutes: 0,
    sessionCount: 0,
  }));
  for (const s of valid) {
    const h = s.started.getHours();
    hourBuckets[h]!.totalMinutes += s.minutes;
    hourBuckets[h]!.sessionCount += 1;
  }
  const maxMinutes = Math.max(0, ...hourBuckets.map((b) => b.totalMinutes));
  const peakHours =
    maxMinutes > 0
      ? hourBuckets.filter((b) => b.totalMinutes === maxMinutes).map((b) => b.hour)
      : [];

  // --- US6: trends (daily 14d, weekly 8w, monthly 6mo) --------------------
  const dailyTrend: HabitsComputed["trends"]["daily"] = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today0, -i);
    const k = dayKey(d);
    const ds = valid.filter((s) => dayKey(s.started) === k);
    dailyTrend.push({
      label: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
      minutes: ds.reduce((a, s) => a + s.minutes, 0),
      sessions: ds.length,
    });
  }

  const weeklyTrend: HabitsComputed["trends"]["weekly"] = [];
  for (let w = 7; w >= 0; w--) {
    const end = addDays(today0, -(w * 7));
    const start = addDays(end, -6);
    const ws = valid.filter((s) => s.started >= start && s.started <= addDays(end, 1));
    weeklyTrend.push({
      label: w === 0 ? "This wk" : `${w}w ago`,
      minutes: ws.reduce((a, s) => a + s.minutes, 0),
      sessions: ws.length,
    });
  }

  const monthlyTrend: HabitsComputed["trends"]["monthly"] = [];
  for (let m = 5; m >= 0; m--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const ms = valid.filter(
      (s) =>
        s.started.getFullYear() === ref.getFullYear() &&
        s.started.getMonth() === ref.getMonth(),
    );
    monthlyTrend.push({
      label: `${MONTHS[ref.getMonth()]} ${String(ref.getFullYear()).slice(2)}`,
      minutes: ms.reduce((a, s) => a + s.minutes, 0),
      sessions: ms.length,
    });
  }

  return {
    dailySummary,
    weeklyConsistency,
    averageDurations,
    productiveHours: hourBuckets,
    peakHours,
    trends: { daily: dailyTrend, weekly: weeklyTrend, monthly: monthlyTrend },
  };
}

// ---------------------------------------------------------------------------
// US5: Submission habits — reuse existing assignments + submissions.
// On-time vs late classification (a punctuality lens distinct from the
// existing Submission Rate %). Provides per-course breakdown for filtering.
// ---------------------------------------------------------------------------

export async function computeSubmissionHabits(
  studentId: number,
  now: Date = new Date(),
): Promise<{
  overall: { total: number; onTime: number; late: number; submissionRate: number };
  byCourse: Array<{
    courseId: number;
    courseName: string;
    total: number;
    onTime: number;
    late: number;
    submissionRate: number;
  }>;
}> {
  const enrollments = await db
    .select()
    .from(studentCoursesTable)
    .where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) {
    return { overall: { total: 0, onTime: 0, late: 0, submissionRate: 0 }, byCourse: [] };
  }

  const courses = await db
    .select()
    .from(coursesTable)
    .where(inArray(coursesTable.id, courseIds));
  const courseMap = new Map(courses.map((c) => [c.id, c]));

  const assignments = await db
    .select()
    .from(assignmentsTable)
    .where(inArray(assignmentsTable.courseId, courseIds));
  const assignmentIds = assignments.map((a) => a.id);
  const submissions = assignmentIds.length
    ? await db
        .select()
        .from(submissionsTable)
        .where(
          and(
            eq(submissionsTable.studentId, studentId),
            inArray(submissionsTable.assignmentId, assignmentIds),
          ),
        )
    : [];
  const subByAssignment = new Map(submissions.map((s) => [s.assignmentId, s]));

  // Only consider assignments whose deadline has passed (a submission habit
  // can only be judged once the deadline exists).
  const due = assignments.filter((a) => new Date(a.dueDate) <= now);

  const perCourse = new Map<
    number,
    { total: number; onTime: number; late: number }
  >();
  for (const id of courseIds) perCourse.set(id, { total: 0, onTime: 0, late: 0 });

  let total = 0;
  let onTime = 0;
  let late = 0;
  for (const a of due) {
    const bucket = perCourse.get(a.courseId);
    if (!bucket) continue;
    bucket.total++;
    total++;
    const sub = subByAssignment.get(a.id);
    if (!sub) continue; // missing — counts toward total but neither on-time nor late
    const isLate =
      sub.status === "late" ||
      (sub.submittedAt != null && new Date(sub.submittedAt) > new Date(a.dueDate));
    const isSubmitted = sub.status === "submitted" || sub.status === "late";
    if (!isSubmitted) continue;
    if (isLate) {
      bucket.late++;
      late++;
    } else {
      bucket.onTime++;
      onTime++;
    }
  }

  const rate = (ot: number, lt: number, t: number) =>
    t === 0 ? 0 : round2(((ot + lt) / t) * 100);

  const byCourse = courseIds
    .map((id) => {
      const b = perCourse.get(id)!;
      return {
        courseId: id,
        courseName: courseMap.get(id)?.courseName ?? `Course ${id}`,
        total: b.total,
        onTime: b.onTime,
        late: b.late,
        submissionRate: rate(b.onTime, b.late, b.total),
      };
    })
    .filter((c) => c.total > 0);

  return {
    overall: { total, onTime, late, submissionRate: rate(onTime, late, total) },
    byCourse,
  };
}

// ---------------------------------------------------------------------------
// US7: inconsistency detection — generate + persist habit alerts.
// Idempotent via the unique (student_id, alert_type, related_key) index.
// ---------------------------------------------------------------------------

interface AlertCandidate {
  alertType: string;
  title: string;
  message: string;
  severity: Severity;
  relatedKey: string;
}

export async function generateHabitAlerts(
  studentId: number,
  computed: HabitsComputed,
  now: Date = new Date(),
): Promise<void> {
  const candidates: AlertCandidate[] = [];
  const today0 = startOfDay(now);

  // --- inactivity: no valid session for >= configured days ----------------
  const last = computed.dailySummary.lastActivityAt
    ? new Date(computed.dailySummary.lastActivityAt)
    : null;
  if (last) {
    const daysSince = Math.floor(
      (today0.getTime() - startOfDay(last).getTime()) / 86_400_000,
    );
    if (daysSince >= HABIT_CONFIG.inactivityDays) {
      const severity: Severity =
        daysSince >= 7 ? "high" : daysSince >= 5 ? "medium" : "low";
      candidates.push({
        alertType: "inactivity",
        title: "Study inactivity detected",
        message: `You have not logged a study session in ${daysSince} days. Restart with a short focused session today to rebuild momentum.`,
        severity,
        // Stable per inactivity episode (keyed on the last active day) so a
        // dismissed alert is not recreated while the same gap persists.
        relatedKey: `inactivity:${dayKey(last)}`,
      });
    }
  }

  // --- duration drop: recent avg session below threshold ------------------
  const weekAvg = computed.averageDurations.weekly;
  if (weekAvg !== null && weekAvg < HABIT_CONFIG.minAvgSessionMinutes) {
    const severity: Severity =
      weekAvg < HABIT_CONFIG.minAvgSessionMinutes / 2 ? "medium" : "low";
    candidates.push({
      alertType: "duration_drop",
      title: "Study sessions getting shorter",
      message: `Your average study session this week is only ${weekAvg} minutes — below the ${HABIT_CONFIG.minAvgSessionMinutes}-minute target. Try longer, deeper focus blocks.`,
      severity,
      relatedKey: `duration_drop:${isoWeekKey(now)}`,
    });
  }

  // --- consistency decline: active days dropped vs prior weeks ------------
  const valid = computed; // pattern already represents the current week
  const currentActive = valid.weeklyConsistency.activeDays;
  const priorAvg = priorWeeksActiveAverage(computed);
  if (priorAvg !== null && priorAvg - currentActive >= HABIT_CONFIG.consistencyDropDays) {
    const drop = round2(priorAvg - currentActive);
    const severity: Severity = drop >= 4 ? "high" : drop >= 3 ? "medium" : "low";
    candidates.push({
      alertType: "consistency_decline",
      title: "Weekly consistency is slipping",
      message: `You studied on ${currentActive} day(s) this week versus a recent average of ${priorAvg}. Schedule fixed study slots to get back on track.`,
      severity,
      relatedKey: `consistency_decline:${isoWeekKey(now)}`,
    });
  }

  // Auto-resolve previously-active alerts whose condition no longer holds, so
  // `/habits` reflects current inconsistencies instead of stale ones. Manually
  // dismissed alerts are left untouched (only status='active' rows are swept).
  const activeKeys = candidates.map((c) => c.relatedKey);
  const resolveConds = [
    eq(studyHabitAlertsTable.studentId, studentId),
    eq(studyHabitAlertsTable.status, "active"),
  ];
  if (activeKeys.length > 0) {
    resolveConds.push(notInArray(studyHabitAlertsTable.relatedKey, activeKeys));
  }
  await db
    .update(studyHabitAlertsTable)
    .set({ status: "resolved", updatedAt: new Date() })
    .where(and(...resolveConds));

  if (candidates.length === 0) return;

  const rows = candidates.map((c) => ({
    studentId,
    alertType: c.alertType,
    title: c.title,
    message: c.message,
    severity: c.severity,
    userStory: "US7",
    relatedKey: c.relatedKey,
  }));

  // Upsert: a recurring condition reactivates a previously auto-resolved alert
  // (refreshing its message/severity), but a user-dismissed alert stays
  // dismissed (setWhere only matches status='resolved').
  await db
    .insert(studyHabitAlertsTable)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        studyHabitAlertsTable.studentId,
        studyHabitAlertsTable.alertType,
        studyHabitAlertsTable.relatedKey,
      ],
      set: {
        status: "active",
        title: sql`excluded.title`,
        message: sql`excluded.message`,
        severity: sql`excluded.severity`,
        updatedAt: new Date(),
      },
      setWhere: eq(studyHabitAlertsTable.status, "resolved"),
    });
}

/**
 * Previous week's active-day count, used as the baseline the current week is
 * compared against for consistency-decline detection. Derived from the daily
 * trend (last 14 days): entries 13..7 days ago form the previous week.
 */
function priorWeeksActiveAverage(computed: HabitsComputed): number | null {
  const daily = computed.trends.daily;
  if (daily.length < 14) return null;
  const prevWeek = daily.slice(0, 7);
  const activePrev = prevWeek.filter((d) => d.sessions > 0).length;
  return activePrev > 0 ? activePrev : null;
}

function isoWeekKey(d: Date): string {
  // ISO week number, used to scope weekly alerts to one per week.
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
