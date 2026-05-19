import { Router, type IRouter } from "express";
import { db, gradesTable, coursesTable, studentCoursesTable, studentsTable, assignmentsTable, submissionsTable, classAveragesTable, submissionGoalsTable } from "@workspace/db";
import { eq, and, inArray, gte, lte } from "drizzle-orm";
import { GetDashboardParams, GetDashboardResponse } from "@workspace/api-zod";
import { weightedAverage, round2 } from "../lib/business";

const router: IRouter = Router();

router.get("/dashboard/:studentId", async (req, res) => {
  const { studentId } = GetDashboardParams.parse(req.params);

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId));
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  const enrollments = await db.select().from(studentCoursesTable).where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);
  const courses = courseIds.length ? await db.select().from(coursesTable).where(inArray(coursesTable.id, courseIds)) : [];
  const courseMap = new Map(courses.map((c) => [c.id, c]));

  const grades = courseIds.length
    ? await db.select().from(gradesTable).where(and(eq(gradesTable.studentId, studentId), inArray(gradesTable.courseId, courseIds)))
    : [];

  const overallAverage = weightedAverage(grades);

  const perCourseAvg = courseIds.map((cid) => {
    const cgs = grades.filter((g) => g.courseId === cid);
    return { courseId: cid, avg: weightedAverage(cgs) };
  });
  const withAvg = perCourseAvg.filter((c) => c.avg !== null) as Array<{ courseId: number; avg: number }>;
  const bestC = withAvg.length ? withAvg.reduce((a, b) => (a.avg >= b.avg ? a : b)) : null;
  const weakC = withAvg.length ? withAvg.reduce((a, b) => (a.avg <= b.avg ? a : b)) : null;
  const bestCourse = bestC ? courseMap.get(bestC.courseId)?.courseName ?? null : null;
  const weakestCourse = weakC ? courseMap.get(weakC.courseId)?.courseName ?? null : null;

  const assignments = courseIds.length
    ? await db.select().from(assignmentsTable).where(inArray(assignmentsTable.courseId, courseIds))
    : [];
  const assignmentIds = assignments.map((a) => a.id);
  const subs = assignmentIds.length
    ? await db.select().from(submissionsTable).where(and(eq(submissionsTable.studentId, studentId), inArray(submissionsTable.assignmentId, assignmentIds)))
    : [];
  const submittedCount = subs.filter((s) => s.status === "submitted" || s.status === "late").length;
  const submissionRate = assignments.length ? round2((submittedCount / assignments.length) * 100) : 0;

  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const dueThisWeek = assignments.filter((a) => {
    const d = new Date(a.dueDate);
    return d >= now && d <= weekEnd && !subs.find((s) => s.assignmentId === a.id && s.status !== "missed");
  }).length;
  const overdueCount = assignments.filter((a) => {
    const d = new Date(a.dueDate);
    return d < now && !subs.find((s) => s.assignmentId === a.id && (s.status === "submitted" || s.status === "late"));
  }).length;

  // class comparison summary
  const classAvgs = courseIds.length
    ? await db.select().from(classAveragesTable).where(inArray(classAveragesTable.courseId, courseIds))
    : [];
  const diffs: number[] = [];
  for (const cid of courseIds) {
    const myAvg = perCourseAvg.find((p) => p.courseId === cid)?.avg;
    const cAvg = classAvgs.find((c) => c.courseId === cid)?.averageGrade;
    if (myAvg !== null && myAvg !== undefined && cAvg !== undefined) diffs.push(myAvg - cAvg);
  }
  let classComparisonSummary = "No data";
  if (diffs.length) {
    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    if (avgDiff > 5) classComparisonSummary = `Ahead of class average by ${avgDiff.toFixed(1)} points`;
    else if (avgDiff < -5) classComparisonSummary = `Behind class average by ${Math.abs(avgDiff).toFixed(1)} points`;
    else classComparisonSummary = `Close to class average (${avgDiff >= 0 ? "+" : ""}${avgDiff.toFixed(1)})`;
  }

  // alerts
  const alerts: string[] = [];
  const [goal] = await db.select().from(submissionGoalsTable).where(eq(submissionGoalsTable.studentId, studentId));
  const target = goal?.targetRate ?? 90;
  if (submissionRate < 60) alerts.push(`Submission rate is critical: ${submissionRate}%`);
  else if (submissionRate < target) alerts.push(`Submission rate ${submissionRate}% is below your ${target}% goal`);
  if (overdueCount > 0) alerts.push(`${overdueCount} overdue assignment${overdueCount === 1 ? "" : "s"}`);
  for (const c of withAvg) {
    if (c.avg < 60) {
      const name = courseMap.get(c.courseId)?.courseName ?? "Course";
      alerts.push(`${name} grade is failing (${c.avg})`);
    }
  }
  // upcoming reminders <24h
  const soon = assignments.filter((a) => {
    const hrs = (new Date(a.dueDate).getTime() - now.getTime()) / 3.6e6;
    return hrs > 0 && hrs < 24 && !subs.find((s) => s.assignmentId === a.id && (s.status === "submitted" || s.status === "late"));
  });
  for (const a of soon) alerts.push(`Due in <24h: ${a.title}`);

  const payload = GetDashboardResponse.parse({
    studentName: student.fullName,
    overallAverage,
    bestCourse,
    weakestCourse,
    submissionRate,
    dueThisWeek,
    overdueCount,
    classComparisonSummary,
    alerts,
  });
  res.json(payload);
});

export default router;
