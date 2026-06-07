import {
  db,
  recommendationsTable,
  gradesTable,
  coursesTable,
  studentCoursesTable,
  attendanceRecordsTable,
  assignmentsTable,
  submissionsTable,
  riskAlertsTable,
  studyHabitAlertsTable,
} from "@workspace/db";
import { eq, and, or, inArray, asc } from "drizzle-orm";
import { weightedAverage, round2 } from "./business";
import { courseStrength } from "./heatmap";

// ---------------------------------------------------------------------------
// Smart Recommendations engine (Sprint 6, US15–US21, US36, US50)
//
// Recommendations are derived dynamically from the student's EXISTING data
// (grades, attendance, submissions, study-habit alerts, heatmap weak-area
// logic and risk alerts) and upserted into `recommendations`. The unique index
// on (student_id, recommendation_type, related_key) makes generation
// idempotent: re-running never creates duplicates (US19) and never resurrects a
// row the student dismissed or manually completed. Every recommendation is
// course-scoped (US21) and carries a concrete, data-derived reason (US18).
//
// Lifecycle (US15/US19):
//  1. Any ACTIVE row whose condition no longer holds is auto-completed
//     (status='completed', auto_completed=true) — "improvement marks old
//     recommendations as completed".
//  2. Current candidates are upserted. On conflict we ONLY reactivate rows that
//     were auto-completed (auto_completed=true) — so a condition that recurs
//     re-surfaces, but a recommendation the student manually completed or
//     dismissed stays put.
// ---------------------------------------------------------------------------

export type Priority = "low" | "medium" | "high";

const GRADE_THRESHOLD = 70;
const ATTENDANCE_THRESHOLD = 75;
const SUBMISSION_THRESHOLD = 80;
const TREND_DELTA = 3; // points of change that count as improving/declining

const sevToPriority: Record<string, Priority> = {
  high: "high",
  medium: "medium",
  low: "low",
};

interface Candidate {
  courseId: number | null;
  courseName: string | null;
  topic: string | null;
  recommendationType: string;
  title: string;
  message: string;
  reason: string;
  priority: Priority;
  userStory: string;
  relatedKey: string;
  sourceData: Record<string, unknown>;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function gradePriority(grade: number): Priority {
  return grade < 50 ? "high" : grade < 60 ? "medium" : "low";
}

type GradeRow = typeof gradesTable.$inferSelect;

/** Attendance % for a set of records: (present + late) / (non-excused). */
function attendanceRate(
  records: ReadonlyArray<{ status: string }>,
): number | null {
  const counted = records.filter((a) => a.status !== "excused");
  if (counted.length === 0) return null;
  const presentLike = counted.filter(
    (a) => a.status === "present" || a.status === "late",
  ).length;
  return round2((presentLike / counted.length) * 100);
}

/**
 * Scan a student's existing data and reconcile their recommendations.
 * Safe to call on every read.
 */
export async function generateRecommendations(studentId: number): Promise<void> {
  const enrollments = await db
    .select()
    .from(studentCoursesTable)
    .where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);

  const courses = courseIds.length
    ? await db
        .select()
        .from(coursesTable)
        .where(inArray(coursesTable.id, courseIds))
    : [];
  const courseMap = new Map(courses.map((c) => [c.id, c]));

  const grades = courseIds.length
    ? await db
        .select()
        .from(gradesTable)
        .where(
          and(
            eq(gradesTable.studentId, studentId),
            inArray(gradesTable.courseId, courseIds),
          ),
        )
        .orderBy(asc(gradesTable.gradeDate), asc(gradesTable.id))
    : [];

  const attendance = courseIds.length
    ? await db
        .select()
        .from(attendanceRecordsTable)
        .where(
          and(
            eq(attendanceRecordsTable.studentId, studentId),
            inArray(attendanceRecordsTable.courseId, courseIds),
          ),
        )
    : [];

  const assignments = courseIds.length
    ? await db
        .select()
        .from(assignmentsTable)
        .where(inArray(assignmentsTable.courseId, courseIds))
    : [];
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

  // Active risk alerts (US50) and active study-habit alerts (US17 — learning
  // activity). We READ these; we never modify the source modules.
  const activeRiskAlerts = await db
    .select()
    .from(riskAlertsTable)
    .where(
      and(
        eq(riskAlertsTable.studentId, studentId),
        eq(riskAlertsTable.status, "active"),
      ),
    );
  const activeHabitAlerts = await db
    .select()
    .from(studyHabitAlertsTable)
    .where(
      and(
        eq(studyHabitAlertsTable.studentId, studentId),
        eq(studyHabitAlertsTable.status, "active"),
      ),
    );

  const now = new Date();
  const candidates: Candidate[] = [];

  // Student's own overall weighted average (used for weak-course detection).
  const overallAvg = weightedAverage(
    grades.filter((g) => isFiniteNumber(g.grade)),
  );

  for (const course of courses) {
    const cGrades = grades.filter((g) => g.courseId === course.id);
    const courseAvg = weightedAverage(cGrades.filter((g) => isFiniteNumber(g.grade)));

    // --- US15: recommendation after a (low) grade ------------------------
    // Keyed per course on the LATEST grade, so when a newer grade recovers the
    // condition disappears and the recommendation is auto-completed.
    const latest = cGrades[cGrades.length - 1];
    if (latest && isFiniteNumber(latest.grade) && latest.grade < GRADE_THRESHOLD) {
      candidates.push({
        courseId: course.id,
        courseName: course.courseName,
        topic: latest.gradeType,
        recommendationType: "low_grade",
        title: `Improve your recent ${course.courseName} result`,
        message:
          "Review the material behind this assessment, redo the questions you missed, and book office hours with your instructor before the next one.",
        reason: `Your most recent grade in ${course.courseName} was ${round2(latest.grade)}% (a ${latest.gradeType} on ${latest.gradeDate}), below the ${GRADE_THRESHOLD}% pass mark.`,
        priority: gradePriority(latest.grade),
        userStory: "US15",
        relatedKey: `course:${course.id}`,
        sourceData: {
          gradeId: latest.id,
          grade: round2(latest.grade),
          gradeType: latest.gradeType,
          gradeDate: latest.gradeDate,
          threshold: GRADE_THRESHOLD,
        },
      });
    }

    // --- US16: weak topics (grade types) within the course ---------------
    const byType = new Map<string, GradeRow[]>();
    for (const g of cGrades) {
      if (!isFiniteNumber(g.grade)) continue;
      const arr = byType.get(g.gradeType) ?? [];
      arr.push(g);
      byType.set(g.gradeType, arr);
    }
    for (const [gradeType, rows] of byType) {
      const typeAvg = weightedAverage(rows);
      if (typeAvg === null || typeAvg >= GRADE_THRESHOLD) continue;
      candidates.push({
        courseId: course.id,
        courseName: course.courseName,
        topic: gradeType,
        recommendationType: "weak_topic",
        title: `Strengthen ${gradeType} in ${course.courseName}`,
        message: `Focus your study time on ${gradeType.toLowerCase()} work in ${course.courseName} — practise past ${gradeType.toLowerCase()} questions and review feedback on previous ones.`,
        reason: `Your ${gradeType} average in ${course.courseName} is ${typeAvg}% across ${rows.length} assessment${rows.length === 1 ? "" : "s"} — a weak area below the ${GRADE_THRESHOLD}% mark.`,
        priority: gradePriority(typeAvg),
        userStory: "US16",
        relatedKey: `course:${course.id}:type:${gradeType}`,
        sourceData: {
          gradeType,
          average: typeAvg,
          count: rows.length,
          threshold: GRADE_THRESHOLD,
        },
      });
    }

    // --- US36: weak course relative to the student's own average ---------
    const strength = courseStrength(courseAvg, overallAvg);
    if (strength === "weak" && courseAvg !== null && overallAvg !== null) {
      const gap = round2(overallAvg - courseAvg);
      candidates.push({
        courseId: course.id,
        courseName: course.courseName,
        topic: null,
        recommendationType: "weak_course",
        title: `${course.courseName} is one of your weaker courses`,
        message: `Give ${course.courseName} extra attention this week — schedule focused revision sessions and identify the specific topics dragging the average down.`,
        reason: `Your ${course.courseName} average (${courseAvg}%) is ${gap} points below your overall average (${overallAvg}%) — flagged as a weak area by Heatmap Analytics.`,
        priority: gap > 15 ? "high" : gap > 8 ? "medium" : "low",
        userStory: "US36",
        relatedKey: `course:${course.id}`,
        sourceData: { courseAverage: courseAvg, overallAverage: overallAvg, gap },
      });
    }

    // --- US36/US17: low attendance --------------------------------------
    const cAtt = attendance.filter((a) => a.courseId === course.id);
    const attRate = attendanceRate(cAtt);
    if (attRate !== null && attRate < ATTENDANCE_THRESHOLD) {
      candidates.push({
        courseId: course.id,
        courseName: course.courseName,
        topic: null,
        recommendationType: "low_attendance",
        title: `Attend more ${course.courseName} sessions`,
        message: `Make attending ${course.courseName} a priority — consistent attendance is one of the strongest predictors of improved grades.`,
        reason: `Your attendance in ${course.courseName} is ${attRate}%, below the ${ATTENDANCE_THRESHOLD}% minimum.`,
        priority: attRate < 60 ? "high" : attRate < 70 ? "medium" : "low",
        userStory: "US36",
        relatedKey: `course:${course.id}`,
        sourceData: { attendanceRate: attRate, threshold: ATTENDANCE_THRESHOLD },
      });
    }

    // --- US17: low submission rate (reuses assignments/submissions) ------
    const cAssignments = assignments.filter((a) => a.courseId === course.id);
    const considered = cAssignments.filter((a) => new Date(a.dueDate) <= now);
    if (considered.length > 0) {
      const submittedLike = considered.filter((a) => {
        const sub = submissions.find((s) => s.assignmentId === a.id);
        return sub && (sub.status === "submitted" || sub.status === "late");
      }).length;
      const subRate = round2((submittedLike / considered.length) * 100);
      if (subRate < SUBMISSION_THRESHOLD) {
        candidates.push({
          courseId: course.id,
          courseName: course.courseName,
          topic: null,
          recommendationType: "low_submission",
          title: `Stay on top of ${course.courseName} submissions`,
          message: `Set reminders a few days before each ${course.courseName} deadline and submit early — missed work is hard to recover from.`,
          reason: `You have submitted only ${subRate}% of ${course.courseName} assignments whose deadline has passed (${submittedLike}/${considered.length}).`,
          priority: subRate < 50 ? "high" : subRate < 70 ? "medium" : "low",
          userStory: "US17",
          relatedKey: `course:${course.id}`,
          sourceData: {
            submissionRate: subRate,
            submitted: submittedLike,
            considered: considered.length,
            threshold: SUBMISSION_THRESHOLD,
          },
        });
      }
    }
  }

  // --- US50: actionable recommendation alongside each active risk alert ---
  for (const alert of activeRiskAlerts) {
    candidates.push({
      courseId: alert.courseId ?? null,
      courseName: alert.courseName ?? null,
      topic: null,
      recommendationType: "risk_followup",
      title: `Act on a risk alert${alert.courseName ? ` in ${alert.courseName}` : ""}`,
      message: alert.recommendation,
      reason: `Linked to your active risk alert: "${alert.title}".`,
      priority: sevToPriority[alert.severity] ?? "medium",
      userStory: "US50",
      relatedKey: `alert:${alert.id}`,
      sourceData: {
        riskAlertId: alert.id,
        alertType: alert.alertType,
        severity: alert.severity,
      },
    });
  }

  // --- US17: recommendation from learning-activity (habit) alerts ---------
  for (const alert of activeHabitAlerts) {
    candidates.push({
      courseId: null,
      courseName: null,
      topic: null,
      recommendationType: "habit_followup",
      title: "Get your study routine back on track",
      message:
        "Block out short, regular study sessions in your calendar — consistency matters more than occasional long sessions.",
      reason: `Based on your learning activity: "${alert.title}".`,
      priority: sevToPriority[alert.severity] ?? "medium",
      userStory: "US17",
      relatedKey: `alert:${alert.id}`,
      sourceData: {
        habitAlertId: alert.id,
        alertType: alert.alertType,
        severity: alert.severity,
      },
    });
  }

  // --- Reconcile against persisted rows ----------------------------------
  const existing = await db
    .select()
    .from(recommendationsTable)
    .where(eq(recommendationsTable.studentId, studentId));
  const existingByKey = new Map(
    existing.map((r) => [`${r.recommendationType}::${r.relatedKey}`, r]),
  );

  // --- US19: collapse near-duplicate cards -------------------------------
  // Candidates that would render identically (same type, course, message and
  // reason — e.g. several risk-followups echoing the same low grade in one
  // course) are grouped and reduced to a single canonical card. Genuinely
  // different source items keep distinct reasons (e.g. different assignment
  // names) and are preserved. Canonical selection is lifecycle-aware: prefer
  // the row already shown (active) over one that can be reactivated
  // (auto-completed / brand new), and never promote a card the student
  // manually dismissed/completed — so dedupe never hides a valid card nor
  // resurrects a dismissed one.
  const dedupeGroups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const sig = `${c.recommendationType}|${c.courseId ?? "g"}|${c.message}|${c.reason}`;
    const arr = dedupeGroups.get(sig);
    if (arr) arr.push(c);
    else dedupeGroups.set(sig, [c]);
  }
  const canonicalRank = (c: Candidate): number => {
    const row = existingByKey.get(`${c.recommendationType}::${c.relatedKey}`);
    if (!row) return 2; // brand new -> will insert as active
    if (row.status === "active") return 3; // already visible -> most stable
    if (row.autoCompleted) return 1; // auto-completed -> reactivatable
    return 0; // manually dismissed/completed -> avoid promoting
  };
  const deduped: Candidate[] = [];
  for (const group of dedupeGroups.values()) {
    let best = group[0]!;
    let bestRank = canonicalRank(best);
    for (let i = 1; i < group.length; i++) {
      const rk = canonicalRank(group[i]!);
      if (rk > bestRank) {
        best = group[i]!;
        bestRank = rk;
      }
    }
    deduped.push(best);
  }

  const currentKeys = new Set(
    deduped.map((c) => `${c.recommendationType}::${c.relatedKey}`),
  );

  // (1) Auto-complete active rows whose condition no longer holds (US15/US19).
  const toAutoComplete = existing.filter(
    (r) =>
      r.status === "active" &&
      !currentKeys.has(`${r.recommendationType}::${r.relatedKey}`),
  );
  for (const r of toAutoComplete) {
    await db
      .update(recommendationsTable)
      .set({ status: "completed", autoCompleted: true, updatedAt: new Date() })
      .where(eq(recommendationsTable.id, r.id));
  }

  if (deduped.length === 0) return;

  // (2) Upsert current candidates. On conflict we refresh content for rows that
  // are currently active OR were auto-completed, and (re)set them to active.
  // Manually completed/dismissed rows (auto_completed=false AND status<>active)
  // are excluded by setWhere, so a student's explicit choice is never undone.
  // Refreshing active rows keeps their message/reason/priority in sync with the
  // latest data (US19).
  for (const c of deduped) {
    await db
      .insert(recommendationsTable)
      .values({
        studentId,
        courseId: c.courseId,
        courseName: c.courseName,
        topic: c.topic,
        recommendationType: c.recommendationType,
        title: c.title,
        message: c.message,
        reason: c.reason,
        priority: c.priority,
        status: "active",
        autoCompleted: false,
        sourceData: JSON.stringify(c.sourceData),
        userStory: c.userStory,
        relatedKey: c.relatedKey,
      })
      .onConflictDoUpdate({
        target: [
          recommendationsTable.studentId,
          recommendationsTable.recommendationType,
          recommendationsTable.relatedKey,
        ],
        set: {
          status: "active",
          autoCompleted: false,
          // Refresh the message/reason/priority so reactivated rows reflect the
          // latest data.
          title: c.title,
          message: c.message,
          reason: c.reason,
          priority: c.priority,
          courseName: c.courseName,
          topic: c.topic,
          sourceData: JSON.stringify(c.sourceData),
          updatedAt: new Date(),
        },
        setWhere: or(
          eq(recommendationsTable.status, "active"),
          eq(recommendationsTable.autoCompleted, true),
        ),
      });
  }
}

// ---------------------------------------------------------------------------
// US20 — per-course improvement tracking. Compares the earlier half of a
// course's grades against the later half to classify the direction of travel.
// ---------------------------------------------------------------------------

export interface CourseImprovementResult {
  courseId: number;
  courseName: string;
  trend: "improving" | "stable" | "declining" | "insufficient_data";
  earlierAverage: number | null;
  laterAverage: number | null;
  delta: number | null;
  currentAverage: number | null;
  sampleSize: number;
}

export async function computeImprovement(
  studentId: number,
): Promise<CourseImprovementResult[]> {
  const enrollments = await db
    .select()
    .from(studentCoursesTable)
    .where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) return [];

  const courses = await db
    .select()
    .from(coursesTable)
    .where(inArray(coursesTable.id, courseIds));

  const grades = await db
    .select()
    .from(gradesTable)
    .where(
      and(
        eq(gradesTable.studentId, studentId),
        inArray(gradesTable.courseId, courseIds),
      ),
    )
    .orderBy(asc(gradesTable.gradeDate), asc(gradesTable.id));

  const results: CourseImprovementResult[] = [];
  for (const course of courses) {
    const cGrades = grades.filter(
      (g) => g.courseId === course.id && isFiniteNumber(g.grade),
    );
    const currentAverage = weightedAverage(cGrades);

    if (cGrades.length < 2) {
      results.push({
        courseId: course.id,
        courseName: course.courseName,
        trend: "insufficient_data",
        earlierAverage: null,
        laterAverage: null,
        delta: null,
        currentAverage,
        sampleSize: cGrades.length,
      });
      continue;
    }

    const mid = Math.floor(cGrades.length / 2);
    const earlier = weightedAverage(cGrades.slice(0, mid));
    const later = weightedAverage(cGrades.slice(mid));
    const delta =
      earlier !== null && later !== null ? round2(later - earlier) : null;
    let trend: CourseImprovementResult["trend"] = "stable";
    if (delta !== null) {
      if (delta > TREND_DELTA) trend = "improving";
      else if (delta < -TREND_DELTA) trend = "declining";
    }

    results.push({
      courseId: course.id,
      courseName: course.courseName,
      trend,
      earlierAverage: earlier,
      laterAverage: later,
      delta,
      currentAverage,
      sampleSize: cGrades.length,
    });
  }
  return results;
}

/** Whether the student has any academic signal to base recommendations on. */
export async function hasAcademicData(studentId: number): Promise<boolean> {
  const [g] = await db
    .select({ id: gradesTable.id })
    .from(gradesTable)
    .where(eq(gradesTable.studentId, studentId))
    .limit(1);
  if (g) return true;
  const [a] = await db
    .select({ id: attendanceRecordsTable.id })
    .from(attendanceRecordsTable)
    .where(eq(attendanceRecordsTable.studentId, studentId))
    .limit(1);
  if (a) return true;
  const [s] = await db
    .select({ id: submissionsTable.id })
    .from(submissionsTable)
    .where(eq(submissionsTable.studentId, studentId))
    .limit(1);
  return Boolean(s);
}
