import { Router, type IRouter } from "express";
import { db, assignmentsTable, coursesTable, studentCoursesTable, submissionsTable, classAveragesTable, submissionGoalsTable } from "@workspace/db";
import { eq, and, inArray, asc } from "drizzle-orm";
import {
  GetSubmissionRateParams,
  GetSubmissionRateResponse,
  GetMissedAssignmentsParams,
  GetMissedAssignmentsResponse,
  UpdateSubmissionGoalParams,
  UpdateSubmissionGoalBody,
  UpdateSubmissionGoalResponse,
} from "@workspace/api-zod";
import { rateLabel, round2 } from "../lib/business";

const router: IRouter = Router();

async function computeRate(studentId: number) {
  const enrollments = await db.select().from(studentCoursesTable).where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);
  const courses = courseIds.length ? await db.select().from(coursesTable).where(inArray(coursesTable.id, courseIds)) : [];
  const assignments = courseIds.length
    ? await db.select().from(assignmentsTable).where(inArray(assignmentsTable.courseId, courseIds)).orderBy(asc(assignmentsTable.dueDate))
    : [];
  const ids = assignments.map((a) => a.id);
  const subs = ids.length
    ? await db.select().from(submissionsTable).where(and(eq(submissionsTable.studentId, studentId), inArray(submissionsTable.assignmentId, ids)))
    : [];
  const classAvgs = courseIds.length
    ? await db.select().from(classAveragesTable).where(inArray(classAveragesTable.courseId, courseIds))
    : [];

  const now = new Date();
  const considered = assignments.filter((a) => new Date(a.dueDate) <= now);

  function classify(a: typeof assignments[number]) {
    const sub = subs.find((s) => s.assignmentId === a.id);
    if (sub && sub.status === "submitted") return "submitted";
    if (sub && sub.status === "late") return "late";
    return "missed";
  }

  const total = considered.length;
  const submitted = considered.filter((a) => classify(a) === "submitted").length;
  const late = considered.filter((a) => classify(a) === "late").length;
  const missed = considered.filter((a) => classify(a) === "missed").length;
  const overall = total ? round2(((submitted + late) / total) * 100) : 0;

  const perCourse = courses.map((c) => {
    const ca = considered.filter((a) => a.courseId === c.id);
    const t = ca.length;
    const s = ca.filter((a) => classify(a) === "submitted").length;
    const l = ca.filter((a) => classify(a) === "late").length;
    const m = ca.filter((a) => classify(a) === "missed").length;
    const cAvg = classAvgs.find((x) => x.courseId === c.id)?.averageSubmissionRate ?? 0;
    return {
      courseId: c.id,
      courseName: c.courseName,
      total: t,
      submitted: s,
      late: l,
      missed: m,
      rate: t ? round2(((s + l) / t) * 100) : 0,
      classAverage: round2(cAvg),
    };
  });

  const classAverage = classAvgs.length ? round2(classAvgs.reduce((s, c) => s + c.averageSubmissionRate, 0) / classAvgs.length) : 0;

  // trend: cumulative rate by due date
  const trend: Array<{ date: string; rate: number }> = [];
  const dueDates = Array.from(new Set(considered.map((a) => a.dueDate.toISOString().slice(0, 10)))).sort();
  for (const d of dueDates) {
    const upto = considered.filter((a) => a.dueDate.toISOString().slice(0, 10) <= d);
    const subUp = upto.filter((a) => classify(a) === "submitted" || classify(a) === "late").length;
    trend.push({ date: d, rate: upto.length ? round2((subUp / upto.length) * 100) : 0 });
  }

  const [goal] = await db.select().from(submissionGoalsTable).where(eq(submissionGoalsTable.studentId, studentId));
  const target = goal?.targetRate ?? 90;
  const label = rateLabel(overall, target);

  const alerts: string[] = [];
  if (overall < 60) alerts.push(`Submission rate is critical at ${overall}%`);
  else if (overall < target) alerts.push(`You are ${round2(target - overall)}% below your ${target}% target`);
  for (const c of perCourse) {
    if (c.total > 0 && c.rate < 60) alerts.push(`${c.courseName} submission rate critical: ${c.rate}%`);
    else if (c.total > 0 && c.rate < target) alerts.push(`${c.courseName} below target: ${c.rate}%`);
  }

  return { overall, total, submitted, late, missed, target, classAverage, label, perCourse, trend, alerts };
}

router.get("/submissions/:studentId/rate", async (req, res) => {
  const { studentId } = GetSubmissionRateParams.parse(req.params);
  const payload = await computeRate(studentId);
  res.json(GetSubmissionRateResponse.parse(payload));
});

router.get("/submissions/:studentId/missed", async (req, res) => {
  const { studentId } = GetMissedAssignmentsParams.parse(req.params);
  const enrollments = await db.select().from(studentCoursesTable).where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) { res.json([]); return; }
  const courses = await db.select().from(coursesTable).where(inArray(coursesTable.id, courseIds));
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const assignments = await db.select().from(assignmentsTable).where(inArray(assignmentsTable.courseId, courseIds));
  const ids = assignments.map((a) => a.id);
  const subs = ids.length
    ? await db.select().from(submissionsTable).where(and(eq(submissionsTable.studentId, studentId), inArray(submissionsTable.assignmentId, ids)))
    : [];
  const now = new Date();
  const missed = assignments
    .filter((a) => {
      if (new Date(a.dueDate) > now) return false;
      const sub = subs.find((s) => s.assignmentId === a.id);
      return !sub || sub.status === "missed";
    })
    .sort((a, b) => +new Date(b.dueDate) - +new Date(a.dueDate))
    .map((a) => ({
      id: a.id,
      title: a.title,
      courseName: courseMap.get(a.courseId)?.courseName ?? "",
      dueDate: a.dueDate.toISOString(),
      status: "missed",
    }));
  res.json(GetMissedAssignmentsResponse.parse(missed));
});

router.put("/submissions/:studentId/goal", async (req, res) => {
  const { studentId } = UpdateSubmissionGoalParams.parse(req.params);
  const { targetRate } = UpdateSubmissionGoalBody.parse(req.body);
  const [existing] = await db.select().from(submissionGoalsTable).where(eq(submissionGoalsTable.studentId, studentId));
  if (existing) {
    await db.update(submissionGoalsTable).set({ targetRate }).where(eq(submissionGoalsTable.id, existing.id));
  } else {
    await db.insert(submissionGoalsTable).values({ studentId, targetRate });
  }
  res.json(UpdateSubmissionGoalResponse.parse({ studentId, targetRate }));
});

export default router;
