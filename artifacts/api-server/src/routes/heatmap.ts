import { Router, type IRouter } from "express";
import {
  db,
  gradesTable,
  coursesTable,
  studentCoursesTable,
  classAveragesTable,
  attendanceRecordsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { GetHeatmapParams, GetHeatmapResponse } from "@workspace/api-zod";
import {
  weightedAverage,
  comparisonStatus,
  round2,
  performanceLevel,
  courseStrength,
  buildMonthPeriods,
  monthKeyOf,
} from "../lib/heatmap";

const router: IRouter = Router();

const isPresent = (s: string) => s === "present" || s === "late";
const isCounted = (s: string) => s !== "excused";

router.get("/heatmap/:studentId", async (req, res) => {
  const { studentId } = GetHeatmapParams.parse(req.params);

  const enrollments = await db
    .select()
    .from(studentCoursesTable)
    .where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);

  const courses = courseIds.length
    ? await db.select().from(coursesTable).where(inArray(coursesTable.id, courseIds))
    : [];
  const grades = courseIds.length
    ? await db
        .select()
        .from(gradesTable)
        .where(and(eq(gradesTable.studentId, studentId), inArray(gradesTable.courseId, courseIds)))
    : [];
  const classAvgs = courseIds.length
    ? await db.select().from(classAveragesTable).where(inArray(classAveragesTable.courseId, courseIds))
    : [];
  const records = courseIds.length
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

  const classAvgByCourse = new Map<number, number>(
    classAvgs.map((ca) => [ca.courseId, ca.averageGrade]),
  );

  // Period columns describe the current term. Attendance defines the term
  // window (its dense, term-bound time series); the term starts at the first
  // attendance month and all attendance + grade months from that point on are
  // shown. This keeps historical grades (earlier terms) out of the grid while
  // never dropping in-term or future grade months. When a student has no
  // attendance at all, fall back to grade months so grade analytics still
  // render rather than showing a false empty state.
  const attendanceMonths = records.map((r) => monthKeyOf(r.sessionDate));
  const gradeMonths = grades.map((g) => monthKeyOf(g.gradeDate));
  let monthKeys: string[];
  if (attendanceMonths.length) {
    const termStart = attendanceMonths.slice().sort()[0]!;
    monthKeys = [
      ...attendanceMonths,
      ...gradeMonths.filter((m) => m >= termStart),
    ];
  } else {
    monthKeys = gradeMonths;
  }
  const periods = buildMonthPeriods(monthKeys);

  // Student overall weighted average across all graded work (US2/US3 baseline).
  const studentOverallAverage = weightedAverage(grades);

  const courseRows = courses.map((c) => {
    const cgs = grades.filter((g) => g.courseId === c.id);
    const overallGrade = weightedAverage(cgs);
    const classAverage = classAvgByCourse.get(c.id) ?? null;
    const gradeDifference =
      overallGrade === null || classAverage === null
        ? null
        : round2(overallGrade - classAverage);

    const gradeCells = periods.map((p) => {
      const inMonth = cgs.filter((g) => monthKeyOf(g.gradeDate) === p.key);
      const value = weightedAverage(inMonth);
      return { periodKey: p.key, value, level: performanceLevel(value) };
    });

    const recs = records.filter((r) => r.courseId === c.id);
    const countedAll = recs.filter((r) => isCounted(r.status));
    const overallAttendance = countedAll.length
      ? round2((countedAll.filter((r) => isPresent(r.status)).length / countedAll.length) * 100)
      : null;

    const attendanceCells = periods.map((p) => {
      const inMonth = recs.filter((r) => monthKeyOf(r.sessionDate) === p.key);
      const counted = inMonth.filter((r) => isCounted(r.status));
      const value = counted.length
        ? round2((counted.filter((r) => isPresent(r.status)).length / counted.length) * 100)
        : null;
      return { periodKey: p.key, value, level: performanceLevel(value) };
    });

    return {
      courseId: c.id,
      courseName: c.courseName,
      overallGrade,
      performanceLevel: performanceLevel(overallGrade),
      strength: courseStrength(overallGrade, studentOverallAverage),
      classAverage,
      gradeDifference,
      comparisonStatus: comparisonStatus(gradeDifference),
      overallAttendance,
      attendanceLevel: performanceLevel(overallAttendance),
      gradeCells,
      attendanceCells,
    };
  });

  // US7 — recommendations derived from heatmap insights (real data, not
  // hardcoded). Weak courses, low attendance, plus positive reinforcement.
  const recommendations: Array<{
    id: string;
    type: string;
    courseName: string | null;
    title: string;
    message: string;
  }> = [];

  for (const cr of courseRows) {
    if (cr.strength === "weak" && cr.overallGrade !== null && studentOverallAverage !== null) {
      const gap = round2(studentOverallAverage - cr.overallGrade);
      recommendations.push({
        id: `weak:${cr.courseId}`,
        type: "weak_course",
        courseName: cr.courseName,
        title: `Focus on ${cr.courseName}`,
        message: `Your ${cr.courseName} average (${cr.overallGrade}%) is ${gap} points below your overall average (${studentOverallAverage}%). Prioritise revision and office hours here.`,
      });
    }
  }

  for (const cr of courseRows) {
    if (cr.overallAttendance !== null && cr.overallAttendance < 80) {
      recommendations.push({
        id: `attend:${cr.courseId}`,
        type: "low_attendance",
        courseName: cr.courseName,
        title: `Improve attendance in ${cr.courseName}`,
        message: `Attendance in ${cr.courseName} is ${cr.overallAttendance}%. Aim for 90%+ — missed sessions correlate with lower grades.`,
      });
    }
  }

  // At least one positive recommendation when a strong course exists (US2).
  const strongest = courseRows
    .filter((c) => c.strength === "strong" && c.overallGrade !== null)
    .sort((a, b) => (b.overallGrade ?? 0) - (a.overallGrade ?? 0))[0];
  if (strongest) {
    recommendations.push({
      id: `strong:${strongest.courseId}`,
      type: "strong_course",
      courseName: strongest.courseName,
      title: `Keep up the momentum in ${strongest.courseName}`,
      message: `${strongest.courseName} (${strongest.overallGrade}%) is one of your strongest courses — well above your overall average. Maintain your current study habits.`,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "all_good",
      type: "strong_course",
      courseName: null,
      title: "You're on track",
      message:
        "No weak courses or attendance concerns detected across your heatmap. Keep up the consistent work.",
    });
  }

  res.json(
    GetHeatmapResponse.parse({
      periods,
      courses: courseRows,
      studentOverallAverage,
      recommendations,
      generatedAt: new Date().toISOString(),
    }),
  );
});

export default router;
