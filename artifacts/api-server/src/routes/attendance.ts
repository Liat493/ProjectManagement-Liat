import { Router, type IRouter } from "express";
import {
  db,
  attendanceRecordsTable,
  coursesTable,
  studentCoursesTable,
} from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import {
  GetAttendanceParams,
  GetAttendanceResponse,
} from "@workspace/api-zod";
import { round2 } from "../lib/business";

const router: IRouter = Router();

router.get("/attendance/:studentId", async (req, res) => {
  const { studentId } = GetAttendanceParams.parse(req.params);

  const enrollments = await db
    .select()
    .from(studentCoursesTable)
    .where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);

  const courses = courseIds.length
    ? await db.select().from(coursesTable).where(inArray(coursesTable.id, courseIds))
    : [];
  const courseMap = new Map(courses.map((c) => [c.id, c]));

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

  // present + late count toward the numerator; excused is removed from
  // the denominator (it is not held against the student).
  const isPresent = (s: string) => s === "present" || s === "late";
  const isCounted = (s: string) => s !== "excused";

  const counted = records.filter((r) => isCounted(r.status));
  const present = counted.filter((r) => isPresent(r.status)).length;
  const overall = counted.length ? round2((present / counted.length) * 100) : 0;

  const perCourse = courses.map((c) => {
    const recs = records.filter((r) => r.courseId === c.id);
    const countedRecs = recs.filter((r) => isCounted(r.status));
    const presentRecs = countedRecs.filter((r) => isPresent(r.status));
    const rate = countedRecs.length
      ? round2((presentRecs.length / countedRecs.length) * 100)
      : 0;
    return {
      courseId: c.id,
      courseName: c.courseName,
      totalSessions: recs.length,
      attended: presentRecs.length,
      absent: recs.filter((r) => r.status === "absent").length,
      late: recs.filter((r) => r.status === "late").length,
      excused: recs.filter((r) => r.status === "excused").length,
      rate,
    };
  });

  // Status label drives the dashboard card colour / messaging.
  let status: string;
  if (counted.length === 0) status = "No data";
  else if (overall >= 95) status = "Excellent";
  else if (overall >= 85) status = "Good";
  else if (overall >= 75) status = "Needs improvement";
  else status = "Critical";

  // Surface low per-course attendance as actionable alerts.
  const alerts = perCourse
    .filter((p) => p.totalSessions > 0 && p.rate < 75)
    .map((p) => `Attendance in ${p.courseName} is ${p.rate}% — below 75%`);

  const payload = GetAttendanceResponse.parse({
    overall,
    totalSessions: counted.length,
    attended: present,
    status,
    perCourse,
    alerts,
  });
  // unused import safety in case courseMap goes unused above
  void courseMap;
  res.json(payload);
});

export default router;
