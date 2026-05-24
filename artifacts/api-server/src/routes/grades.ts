import { Router, type IRouter } from "express";
import { db, gradesTable, coursesTable, studentCoursesTable, studentsTable } from "@workspace/db";
import { eq, and, inArray, asc } from "drizzle-orm";
import {
  GetAveragesParams,
  GetAveragesResponse,
  GetGradeBreakdownParams,
  GetGradeBreakdownResponse,
  AddGradeBody,
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
  const perCourse = courses.map((c) => {
    const cgs = grades.filter((g) => g.courseId === c.id);
    return {
      courseId: c.id,
      courseName: c.courseName,
      average: weightedAverage(cgs),
      gradeCount: cgs.length,
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

router.post("/grades", async (req, res) => {
  const body = AddGradeBody.parse(req.body);
  if (body.studentId !== req.session?.studentId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, body.studentId));
  if (!student) { res.status(400).json({ error: "Invalid student" }); return; }
  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, body.courseId));
  if (!course) { res.status(400).json({ error: "Invalid course" }); return; }
  const [created] = await db.insert(gradesTable).values({
    studentId: body.studentId,
    courseId: body.courseId,
    grade: body.grade,
    weight: body.weight,
    gradeType: body.gradeType,
    gradeDate: body.gradeDate,
  }).returning();
  res.status(201).json(created);
});

export default router;
