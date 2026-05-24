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

  const classAvgByCourse = new Map<number, number>(
    classAvgs.map((ca) => [ca.courseId, ca.averageGrade]),
  );

  const items = courses.map((c) => {
    const cgs = grades.filter((g) => g.courseId === c.id);
    const studentAverage = weightedAverage(cgs);
    const classAverage = classAvgByCourse.get(c.id) ?? 0;
    const difference = studentAverage === null ? null : round2(studentAverage - classAverage);

    // Per-course trend: at each date the student has a grade in this course,
    // running weighted average of student grades vs. running weighted average
    // of the class-average-for-this-course using the same weights. Since
    // classAverage is constant per course, the class line is flat at that
    // course's class average — exactly the right baseline to compare against.
    const courseDates = Array.from(new Set(cgs.map((g) => g.gradeDate))).sort();
    const courseTrend = courseDates.flatMap((d) => {
      const upto = cgs.filter((g) => g.gradeDate <= d);
      const sAvg = weightedAverage(upto);
      if (sAvg === null) return [];
      return [{ date: d, studentAverage: sAvg, classAverage: round2(classAverage) }];
    });

    return {
      courseId: c.id,
      courseName: c.courseName,
      studentAverage,
      classAverage,
      difference,
      status: comparisonStatus(difference),
      trend: courseTrend,
    };
  });

  // Overall trend: at each grade date, running weighted average of the
  // student's grades up to that date, paired with the running weighted
  // average the class would score on the same set of weighted assessments
  // (per-grade class-avg, weighted by grade.weight). This makes the class
  // line a real time series that tracks the same assessments the student
  // is being measured on.
  const trend: Array<{ date: string; studentAverage: number; classAverage: number }> = [];
  const dates = Array.from(new Set(grades.map((g) => g.gradeDate))).sort();
  for (const d of dates) {
    const upto = grades.filter((g) => g.gradeDate <= d);
    const sAvg = weightedAverage(upto);
    if (sAvg === null) continue;
    const classWeighted = upto.map((g) => ({
      grade: classAvgByCourse.get(g.courseId) ?? 0,
      weight: g.weight,
    }));
    const cAvg = weightedAverage(classWeighted) ?? 0;
    trend.push({ date: d, studentAverage: sAvg, classAverage: round2(cAvg) });
  }

  res.json(GetComparisonResponse.parse({ items, trend }));
});

export default router;
