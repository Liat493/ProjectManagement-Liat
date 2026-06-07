import {
  db,
  riskAlertsTable,
  gradesTable,
  coursesTable,
  studentCoursesTable,
  assignmentsTable,
  submissionsTable,
  attendanceRecordsTable,
} from "@workspace/db";
import { eq, and, inArray, asc } from "drizzle-orm";
import { weightedAverage, round2 } from "./business";

// ---------------------------------------------------------------------------
// Risk Alerts generation engine (Sprint 3, US1–US7)
//
// Alerts are derived dynamically from the student's existing academic data
// (grades, attendance, submissions) and upserted into `risk_alerts`. The
// unique index on (student_id, alert_type, related_key) makes generation
// idempotent: re-running never creates duplicates and never resurrects an
// alert the student already resolved or dismissed. Every alert carries a
// recommendation (US7) and a user-story tag for traceability.
// ---------------------------------------------------------------------------

export type Severity = "low" | "medium" | "high";

export const sevRank: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

// Thresholds kept consistent with the rest of the system (attendance uses 75%
// elsewhere in the app; passing grade threshold is 70%).
const GRADE_THRESHOLD = 70;
const ATTENDANCE_THRESHOLD = 75;

// US7 — a concrete, actionable recommendation for every alert type.
const RECOMMENDATIONS: Record<string, string> = {
  low_grade:
    "Review this topic and revisit related coursework. Book office hours with your instructor to close the gap before the next assessment.",
  attendance:
    "Attend upcoming sessions consistently. If an absence was unavoidable, ask your instructor to record it as excused.",
  declining_trend:
    "Your recent grades are trending downward. Revisit your study routine and seek help early — before the next assessment.",
  missing_submission:
    "Submit the outstanding work as soon as possible and contact your instructor about late-submission options.",
  late_submission:
    "Plan ahead for upcoming deadlines and set reminders a few days early to avoid late penalties.",
  high_risk_course:
    "This course needs immediate attention across grades, attendance and submissions. Build a focused recovery plan with your instructor.",
};

interface Candidate {
  alertType: string;
  courseId: number | null;
  courseName: string | null;
  title: string;
  message: string;
  severity: Severity;
  userStory: string;
  relatedKey: string;
  riskScore: number | null;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Scan a student's academic data and persist any new risk alerts.
 * Safe to call on every read — it only inserts conditions that are not
 * already recorded.
 */
export async function generateAlerts(studentId: number): Promise<void> {
  const enrollments = await db
    .select()
    .from(studentCoursesTable)
    .where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) return;

  const courses = await db
    .select()
    .from(coursesTable)
    .where(inArray(coursesTable.id, courseIds));
  const courseMap = new Map(courses.map((c) => [c.id, c]));

  const grades = await db
    .select()
    .from(gradesTable)
    .where(
      and(
        eq(gradesTable.studentId, studentId),
        inArray(gradesTable.courseId, courseIds),
      ),
    )
    .orderBy(asc(gradesTable.gradeDate));

  const attendance = await db
    .select()
    .from(attendanceRecordsTable)
    .where(
      and(
        eq(attendanceRecordsTable.studentId, studentId),
        inArray(attendanceRecordsTable.courseId, courseIds),
      ),
    );

  const assignments = await db
    .select()
    .from(assignmentsTable)
    .where(inArray(assignmentsTable.courseId, courseIds));
  const assignmentMap = new Map(assignments.map((a) => [a.id, a]));
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

  const now = new Date();
  const candidates: Candidate[] = [];

  // --- US1: individual low grades -----------------------------------------
  for (const g of grades) {
    if (!isFiniteNumber(g.grade) || g.grade >= GRADE_THRESHOLD) continue;
    const course = courseMap.get(g.courseId);
    const severity: Severity =
      g.grade < 50 ? "high" : g.grade < 60 ? "medium" : "low";
    candidates.push({
      alertType: "low_grade",
      courseId: g.courseId,
      courseName: course?.courseName ?? null,
      title: `Low grade in ${course?.courseName ?? "a course"}`,
      message: `Scored ${round2(g.grade)}% on a ${g.gradeType} (${g.gradeDate}) — below the ${GRADE_THRESHOLD}% threshold.`,
      severity,
      userStory: "US1",
      relatedKey: `grade:${g.id}`,
      riskScore: null,
    });
  }

  // --- per-course aggregates (attendance, trend, submission, risk) --------
  for (const course of courses) {
    const cGrades = grades.filter((g) => g.courseId === course.id);
    const avg = weightedAverage(cGrades);

    // --- US2: attendance below threshold ---------------------------------
    const cAtt = attendance.filter((a) => a.courseId === course.id);
    const counted = cAtt.filter((a) => a.status !== "excused");
    const presentLike = counted.filter(
      (a) => a.status === "present" || a.status === "late",
    ).length;
    const attRate = counted.length
      ? round2((presentLike / counted.length) * 100)
      : null;
    if (attRate !== null && attRate < ATTENDANCE_THRESHOLD) {
      const severity: Severity =
        attRate < 60 ? "high" : attRate < 70 ? "medium" : "low";
      candidates.push({
        alertType: "attendance",
        courseId: course.id,
        courseName: course.courseName,
        title: `Attendance dropping in ${course.courseName}`,
        message: `Attendance is ${attRate}% — below the ${ATTENDANCE_THRESHOLD}% minimum.`,
        severity,
        userStory: "US2",
        relatedKey: `attendance:${course.id}`,
        riskScore: null,
      });
    }

    // --- US3: declining grade trend --------------------------------------
    const values = cGrades.map((g) => g.grade).filter(isFiniteNumber);
    if (values.length >= 3) {
      let dec = 0;
      let inc = 0;
      for (let i = 1; i < values.length; i++) {
        if (values[i]! < values[i - 1]!) dec++;
        else if (values[i]! > values[i - 1]!) inc++;
      }
      const drop = round2(values[0]! - values[values.length - 1]!);
      if (drop > 5 && dec > inc) {
        const severity: Severity =
          drop > 15 ? "high" : drop > 8 ? "medium" : "low";
        candidates.push({
          alertType: "declining_trend",
          courseId: course.id,
          courseName: course.courseName,
          title: `Grades declining in ${course.courseName}`,
          message: `Grades have fallen ${drop} points across recent assessments (from ${round2(values[0]!)}% to ${round2(values[values.length - 1]!)}%).`,
          severity,
          userStory: "US3",
          relatedKey: `trend:${course.id}`,
          riskScore: null,
        });
      }
    }

    // --- US5: high-risk course (composite) -------------------------------
    const cAssignments = assignments.filter((a) => a.courseId === course.id);
    const considered = cAssignments.filter((a) => new Date(a.dueDate) <= now);
    const submittedLike = considered.filter((a) => {
      const sub = submissions.find((s) => s.assignmentId === a.id);
      return sub && (sub.status === "submitted" || sub.status === "late");
    }).length;
    const subRate = considered.length
      ? round2((submittedLike / considered.length) * 100)
      : null;

    // Weighted risk: grades dominate, attendance and submissions contribute.
    // Components default to neutral (0 risk) when data is missing.
    const gradeRisk = avg !== null ? 100 - avg : 0;
    const attRisk = attRate !== null ? 100 - attRate : 0;
    const subRisk = subRate !== null ? 100 - subRate : 0;
    const riskScore = round2(0.5 * gradeRisk + 0.25 * attRisk + 0.25 * subRisk);
    const hasSignal = avg !== null || attRate !== null || subRate !== null;
    if (hasSignal && riskScore >= 30) {
      const severity: Severity =
        riskScore >= 60 ? "high" : riskScore >= 45 ? "medium" : "low";
      const parts: string[] = [];
      if (avg !== null) parts.push(`average ${avg}%`);
      if (attRate !== null) parts.push(`attendance ${attRate}%`);
      if (subRate !== null) parts.push(`submissions ${subRate}%`);
      candidates.push({
        alertType: "high_risk_course",
        courseId: course.id,
        courseName: course.courseName,
        title: `${course.courseName} is at risk`,
        message: `Risk score ${riskScore}/100 — ${parts.join(", ")}.`,
        severity,
        userStory: "US5",
        relatedKey: `risk:${course.id}`,
        riskScore,
      });
    }
  }

  // --- US4: missing / late submissions ------------------------------------
  for (const a of assignments) {
    const sub = submissions.find((s) => s.assignmentId === a.id);
    const course = courseMap.get(a.courseId);
    const overdue = new Date(a.dueDate) <= now;
    const submittedLike =
      sub && (sub.status === "submitted" || sub.status === "late");
    if (overdue && !submittedLike) {
      candidates.push({
        alertType: "missing_submission",
        courseId: a.courseId,
        courseName: course?.courseName ?? null,
        title: `Missing submission: ${a.title}`,
        message: `"${a.title}" for ${course?.courseName ?? "a course"} was due ${new Date(a.dueDate).toISOString().slice(0, 10)} and has not been submitted.`,
        severity: "high",
        userStory: "US4",
        relatedKey: `missing:${a.id}`,
        riskScore: null,
      });
    } else if (sub && sub.status === "late") {
      candidates.push({
        alertType: "late_submission",
        courseId: a.courseId,
        courseName: course?.courseName ?? null,
        title: `Late submission: ${a.title}`,
        message: `"${a.title}" for ${course?.courseName ?? "a course"} was submitted after the deadline.`,
        severity: "low",
        userStory: "US4",
        relatedKey: `late:${a.id}`,
        riskScore: null,
      });
    }
  }

  void assignmentMap;

  // Duplicate alerts are prevented by the unique (studentId, alertType,
  // relatedKey) index — each alert maps to a single stable source item
  // (grade:{id}, missing:{assignmentId}, …). Orphaned rows whose source item
  // was deleted are handled by data cleanup, not a content filter here, so
  // genuinely distinct alerts are never silently dropped.
  if (candidates.length === 0) return;

  const rows = candidates.map((c) => ({
    studentId,
    alertType: c.alertType,
    courseId: c.courseId,
    courseName: c.courseName,
    title: c.title,
    message: c.message,
    severity: c.severity,
    recommendation: RECOMMENDATIONS[c.alertType] ?? "Review this alert and take action.",
    userStory: c.userStory,
    relatedKey: c.relatedKey,
    riskScore: c.riskScore,
  }));

  // Idempotent: existing (studentId, alertType, relatedKey) rows are left
  // untouched, preserving their status and history.
  await db.insert(riskAlertsTable).values(rows).onConflictDoNothing();
}
