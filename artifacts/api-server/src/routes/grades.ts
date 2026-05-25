import { Router, type IRouter } from "express";
import { db, gradesTable, coursesTable, studentCoursesTable, courseFinalGradesTable } from "@workspace/db";
import { eq, and, inArray, asc } from "drizzle-orm";
import {
  GetAveragesParams,
  GetAveragesResponse,
  GetGradeBreakdownParams,
  GetGradeBreakdownResponse,
} from "@workspace/api-zod";
import { weightedAverage } from "../lib/business";

const router: IRouter = Router();

router.get("/grades/:studentId/averages", async (req, res) => {
  const { studentId } = GetAveragesParams.parse(req.params);
  const semesterFilter = typeof req.query["semester"] === "string" ? req.query["semester"] : null;

  const enrollments = await db.select().from(studentCoursesTable).where(eq(studentCoursesTable.studentId, studentId));
  const enrolledCourseIds = enrollments.map((e) => e.courseId);
  const allCourses = enrolledCourseIds.length
    ? await db.select().from(coursesTable).where(inArray(coursesTable.id, enrolledCourseIds))
    : [];

  // Full semester list (across all of the student's enrollments) — used to
  // populate the semester selector regardless of which semester is currently
  // being viewed. Sorted for stable UI ordering.
  const semesters = Array.from(new Set(allCourses.map((c) => c.semester))).sort();

  // Apply the (optional) semester filter to the course set used for the
  // averages/trend/breakdown payload. Default = all courses (preserves the
  // previous behaviour for clients that don't pass a semester).
  const courses = semesterFilter
    ? allCourses.filter((c) => c.semester === semesterFilter)
    : allCourses;
  const courseIds = courses.map((c) => c.id);

  const grades = courseIds.length
    ? await db
        .select()
        .from(gradesTable)
        .where(and(eq(gradesTable.studentId, studentId), inArray(gradesTable.courseId, courseIds)))
        .orderBy(asc(gradesTable.gradeDate))
    : [];

  const overall = weightedAverage(grades);

  // Final-grade snapshots, if recorded for any of the in-scope courses.
  const finals = courseIds.length
    ? await db
        .select()
        .from(courseFinalGradesTable)
        .where(
          and(
            eq(courseFinalGradesTable.studentId, studentId),
            inArray(courseFinalGradesTable.courseId, courseIds),
          ),
        )
    : [];
  const finalByCourse = new Map(finals.map((f) => [f.courseId, f]));

  const perCourse = courses.map((c) => {
    const cgs = grades.filter((g) => g.courseId === c.id);
    const fin = finalByCourse.get(c.id);
    return {
      courseId: c.id,
      courseName: c.courseName,
      average: weightedAverage(cgs),
      gradeCount: cgs.length,
      finalGrade: fin?.finalGrade ?? null,
      letterGrade: fin?.letterGrade ?? null,
    };
  });
  const dates = Array.from(new Set(grades.map((g) => g.gradeDate))).sort();
  const trend = dates.map((d) => ({ date: d, average: weightedAverage(grades.filter((g) => g.gradeDate <= d)) ?? 0 }));

  res.json(GetAveragesResponse.parse({ overall, perCourse, trend, semesters }));
});

router.get("/grades/:studentId/breakdown/:courseId", async (req, res) => {
  const { studentId, courseId } = GetGradeBreakdownParams.parse(req.params);
  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, courseId));
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }
  const grades = await db
    .select()
    .from(gradesTable)
    .where(and(eq(gradesTable.studentId, studentId), eq(gradesTable.courseId, courseId)))
    .orderBy(asc(gradesTable.gradeDate));
  res.json(
    GetGradeBreakdownResponse.parse({
      courseId: course.id,
      courseName: course.courseName,
      weightedAverage: weightedAverage(grades),
      grades,
    }),
  );
});

// NOTE: grade write endpoints intentionally removed — this is a student-side
// dashboard. Grades are seeded/managed directly in the Demo DB and the
// dashboard recomputes everything dynamically on refresh.

export default router;
