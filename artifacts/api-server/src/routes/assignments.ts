import { Router, type IRouter } from "express";
import { db, assignmentsTable, coursesTable, studentCoursesTable, submissionsTable } from "@workspace/db";
import { eq, and, inArray, asc } from "drizzle-orm";
import {
  GetWeeklyAssignmentsParams,
  GetWeeklyAssignmentsResponse,
  CompleteAssignmentParams,
  CompleteAssignmentBody,
  CompleteAssignmentResponse,
} from "@workspace/api-zod";
import { round2 } from "../lib/business";

const router: IRouter = Router();

function urgencyFor(hrs: number, isOverdue: boolean): string {
  if (isOverdue) return "Overdue";
  if (hrs < 24) return "Due Soon";
  if (hrs < 72) return "Upcoming";
  return "Later";
}

router.get("/assignments/:studentId/weekly", async (req, res) => {
  const { studentId } = GetWeeklyAssignmentsParams.parse(req.params);
  const enrollments = await db.select().from(studentCoursesTable).where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) { res.json([]); return; }
  const courses = await db.select().from(coursesTable).where(inArray(coursesTable.id, courseIds));
  const courseMap = new Map(courses.map((c) => [c.id, c]));
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const assignments = await db
    .select()
    .from(assignmentsTable)
    .where(inArray(assignmentsTable.courseId, courseIds))
    .orderBy(asc(assignmentsTable.dueDate));
  const ids = assignments.map((a) => a.id);
  const subs = ids.length
    ? await db.select().from(submissionsTable).where(and(eq(submissionsTable.studentId, studentId), inArray(submissionsTable.assignmentId, ids)))
    : [];

  const result = assignments
    .filter((a) => {
      const d = new Date(a.dueDate);
      const sub = subs.find((s) => s.assignmentId === a.id);
      // include if due this week OR overdue+not completed
      const inWeek = d >= now && d <= weekEnd;
      const overdue = d < now && !(sub && (sub.status === "submitted" || sub.status === "late"));
      return inWeek || overdue;
    })
    .map((a) => {
      const sub = subs.find((s) => s.assignmentId === a.id);
      const hrs = round2((new Date(a.dueDate).getTime() - now.getTime()) / 3.6e6);
      const isOverdue = hrs < 0 && !(sub && (sub.status === "submitted" || sub.status === "late"));
      const status = sub ? sub.status : isOverdue ? "missed" : "pending";
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        courseId: a.courseId,
        courseName: courseMap.get(a.courseId)?.courseName ?? "",
        dueDate: a.dueDate.toISOString(),
        status,
        urgency: urgencyFor(hrs, isOverdue),
        isOverdue,
        hoursUntilDue: hrs,
      };
    });

  res.json(GetWeeklyAssignmentsResponse.parse(result));
});

router.put("/assignments/:assignmentId/complete", async (req, res) => {
  const { assignmentId } = CompleteAssignmentParams.parse(req.params);
  const { studentId } = CompleteAssignmentBody.parse(req.body);
  const [assignment] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, assignment.courseId));
  const now = new Date();
  const late = now > new Date(assignment.dueDate);
  const status = late ? "late" : "submitted";

  const [existing] = await db
    .select()
    .from(submissionsTable)
    .where(and(eq(submissionsTable.studentId, studentId), eq(submissionsTable.assignmentId, assignmentId)));
  if (existing) {
    await db
      .update(submissionsTable)
      .set({ submittedAt: now, status })
      .where(eq(submissionsTable.id, existing.id));
  } else {
    await db.insert(submissionsTable).values({ studentId, assignmentId, submittedAt: now, status });
  }

  const hrs = round2((new Date(assignment.dueDate).getTime() - now.getTime()) / 3.6e6);
  res.json(
    CompleteAssignmentResponse.parse({
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      courseId: assignment.courseId,
      courseName: course?.courseName ?? "",
      dueDate: assignment.dueDate.toISOString(),
      status,
      urgency: late ? "Overdue" : "Due Soon",
      isOverdue: false,
      hoursUntilDue: hrs,
    }),
  );
});

export default router;
