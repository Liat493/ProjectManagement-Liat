import { Router, type IRouter } from "express";
import { db, gradesTable, coursesTable, studentCoursesTable, classAveragesTable } from "@workspace/db";
import { eq, and, inArray, asc } from "drizzle-orm";
import { GetComparisonParams, GetComparisonResponse } from "@workspace/api-zod";
import { weightedAverage, comparisonStatus, round2 } from "../lib/business";

const router: IRouter = Router();

router.get("/comparison/:studentId", async (req, res) => {
  const { studentId } = GetComparisonParams.parse(req.params);
  const enrollments = await db.select().from(studentCoursesTable).where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);
  const courses = courseIds.length ? await db.select().from(coursesTable).where(inArray(coursesTable.id, courseIds)) : [];
  const grades = courseIds.length
    ? await db.select().from(gradesTable).where(and(eq(gradesTable.studentId, studentId), inArray(gradesTable.courseId, courseIds))).orderBy(asc(gradesTable.gradeDate))
    : [];
  const classAvgs = courseIds.length
    ? await db.select().from(classAveragesTable).where(inArray(classAveragesTable.courseId, courseIds))
    : [];

  const items = courses.map((c) => {
    const cgs = grades.filter((g) => g.courseId === c.id);
    const studentAverage = weightedAverage(cgs);
    const classAverage = classAvgs.find((ca) => ca.courseId === c.id)?.averageGrade ?? 0;
    const difference = studentAverage === null ? null : round2(studentAverage - classAverage);
    return {
      courseId: c.id,
      courseName: c.courseName,
      studentAverage,
      classAverage,
      difference,
      status: comparisonStatus(difference),
    };
  });

  // Build trend: per gradeDate, weighted avg of grades up to that date across all courses, paired with avg class average
  const trend: Array<{ date: string; studentAverage: number; classAverage: number }> = [];
  const dates = Array.from(new Set(grades.map((g) => g.gradeDate))).sort();
  const classAvgMean = classAvgs.length ? classAvgs.reduce((s, c) => s + c.averageGrade, 0) / classAvgs.length : 0;
  for (const d of dates) {
    const upto = grades.filter((g) => g.gradeDate <= d);
    const avg = weightedAverage(upto);
    if (avg !== null) trend.push({ date: d, studentAverage: avg, classAverage: round2(classAvgMean) });
  }

  res.json(GetComparisonResponse.parse({ items, trend }));
});

export default router;
