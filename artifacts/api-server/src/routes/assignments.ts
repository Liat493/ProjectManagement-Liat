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

const MS_PER_DAY = 86400000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / MS_PER_DAY);
}

type SubmissionRow = { assignmentId: number; status: string; submittedAt: Date | null };

function classify(
  due: Date,
  now: Date,
  sub: SubmissionRow | undefined,
): { urgency: string; isOverdue: boolean; isCompleted: boolean } {
  const isCompleted = !!sub && (sub.status === "submitted" || sub.status === "late");
  if (isCompleted) return { urgency: "Completed", isOverdue: false, isCompleted: true };
  if (due.getTime() < now.getTime()) return { urgency: "Overdue", isOverdue: true, isCompleted: false };
  const daysUntil = daysBetween(due, now);
  if (daysUntil === 0) return { urgency: "Due Today", isOverdue: false, isCompleted: false };
  if (daysUntil === 1) return { urgency: "Due Tomorrow", isOverdue: false, isCompleted: false };
  if (daysUntil <= 3) return { urgency: "Due Soon", isOverdue: false, isCompleted: false };
  return { urgency: "Upcoming", isOverdue: false, isCompleted: false };
}

router.get("/assignments/:studentId/weekly", async (req, res) => {
  const { studentId } = GetWeeklyAssignmentsParams.parse(req.params);

  const enrollments = await db
    .select()
    .from(studentCoursesTable)
    .where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) {
    res.json([]);
    return;
  }
  const courses = await db.select().from(coursesTable).where(inArray(coursesTable.id, courseIds));
  const courseMap = new Map(courses.map((c) => [c.id, c]));

  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const recentCompletedWindow = new Date(now);
  recentCompletedWindow.setDate(recentCompletedWindow.getDate() - 7);

  const assignments = await db
    .select()
    .from(assignmentsTable)
    .where(inArray(assignmentsTable.courseId, courseIds))
    .orderBy(asc(assignmentsTable.dueDate));
  const ids = assignments.map((a) => a.id);
  const subs: SubmissionRow[] = ids.length
    ? await db
        .select()
        .from(submissionsTable)
        .where(
          and(
            eq(submissionsTable.studentId, studentId),
            inArray(submissionsTable.assignmentId, ids),
          ),
        )
    : [];

  const visible = assignments.filter((a) => {
    const due = new Date(a.dueDate);
    const sub = subs.find((s) => s.assignmentId === a.id);
    const isCompleted = !!sub && (sub.status === "submitted" || sub.status === "late");
    const inWeek = due >= now && due <= weekEnd;
    const overdueOpen = due < now && !isCompleted;
    const recentlyCompleted = isCompleted && due >= recentCompletedWindow;
    return inWeek || overdueOpen || recentlyCompleted;
  });

  const result = visible.map((a) => {
    const due = new Date(a.dueDate);
    const sub = subs.find((s) => s.assignmentId === a.id);
    const { urgency, isOverdue, isCompleted } = classify(due, now, sub);
    const hrs = round2((due.getTime() - now.getTime()) / 3.6e6);
    let daysLate = 0;
    if (isCompleted && sub?.submittedAt) {
      const diff = daysBetween(new Date(sub.submittedAt), due);
      daysLate = diff > 0 ? diff : 0;
    } else if (isOverdue) {
      daysLate = daysBetween(now, due);
    }
    const isDueWithin24Hours = !isCompleted && hrs >= 0 && hrs <= 24;
    const status = isCompleted ? (sub!.status === "late" ? "late" : "submitted") : isOverdue ? "missed" : "pending";
    return {
      id: a.id,
      title: a.title,
      description: a.description,
      courseId: a.courseId,
      courseName: courseMap.get(a.courseId)?.courseName ?? "",
      dueDate: due.toISOString(),
      status,
      urgency,
      isOverdue,
      hoursUntilDue: hrs,
      completedAt: isCompleted && sub?.submittedAt ? new Date(sub.submittedAt).toISOString() : null,
      daysLate,
      isDueWithin24Hours,
    };
  });

  // Sort: overdue (most days late first) → due today → due tomorrow → soonest first → completed last
  const urgencyRank: Record<string, number> = {
    Overdue: 0,
    "Due Today": 1,
    "Due Tomorrow": 2,
    "Due Soon": 3,
    Upcoming: 4,
    Completed: 5,
  };
  result.sort((a, b) => {
    const ra = urgencyRank[a.urgency] ?? 9;
    const rb = urgencyRank[b.urgency] ?? 9;
    if (ra !== rb) return ra - rb;
    if (a.urgency === "Overdue") return b.daysLate - a.daysLate;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  res.json(GetWeeklyAssignmentsResponse.parse(result));
});

router.put("/assignments/:assignmentId/complete", async (req, res) => {
  const { assignmentId } = CompleteAssignmentParams.parse(req.params);
  const { studentId } = CompleteAssignmentBody.parse(req.body);
  const [assignment] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }
  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, assignment.courseId));
  const now = new Date();
  const due = new Date(assignment.dueDate);
  const late = now > due;
  const status = late ? "late" : "submitted";

  const [existing] = await db
    .select()
    .from(submissionsTable)
    .where(
      and(eq(submissionsTable.studentId, studentId), eq(submissionsTable.assignmentId, assignmentId)),
    );
  if (existing) {
    await db
      .update(submissionsTable)
      .set({ submittedAt: now, status })
      .where(eq(submissionsTable.id, existing.id));
  } else {
    await db.insert(submissionsTable).values({ studentId, assignmentId, submittedAt: now, status });
  }

  const hrs = round2((due.getTime() - now.getTime()) / 3.6e6);
  const daysLate = late ? daysBetween(now, due) : 0;
  res.json(
    CompleteAssignmentResponse.parse({
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      courseId: assignment.courseId,
      courseName: course?.courseName ?? "",
      dueDate: due.toISOString(),
      status,
      urgency: "Completed",
      isOverdue: false,
      hoursUntilDue: hrs,
      completedAt: now.toISOString(),
      daysLate,
      isDueWithin24Hours: false,
    }),
  );
});

export default router;
