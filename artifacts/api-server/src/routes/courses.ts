import { Router, type IRouter } from "express";
import { db, coursesTable, studentCoursesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { GetStudentCoursesParams, GetStudentCoursesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/students/:studentId/courses", async (req, res) => {
  const { studentId } = GetStudentCoursesParams.parse(req.params);
  const enrollments = await db.select().from(studentCoursesTable).where(eq(studentCoursesTable.studentId, studentId));
  const ids = enrollments.map((e) => e.courseId);
  const courses = ids.length ? await db.select().from(coursesTable).where(inArray(coursesTable.id, ids)) : [];
  res.json(GetStudentCoursesResponse.parse(courses));
});

export default router;
