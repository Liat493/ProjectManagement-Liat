import { Router, type IRouter } from "express";
import {
  db,
  recommendationsTable,
  coursesTable,
  studentCoursesTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  GetRecommendationsParams,
  GetRecommendationsResponse,
  UpdateRecommendationStatusParams,
  UpdateRecommendationStatusBody,
  UpdateRecommendationStatusResponse,
} from "@workspace/api-zod";
import {
  generateRecommendations,
  computeImprovement,
  hasAcademicData,
} from "../lib/recommendations";

const router: IRouter = Router();

type RecommendationRow = typeof recommendationsTable.$inferSelect;

const priorityRank: Record<string, number> = { high: 3, medium: 2, low: 1 };

function serialize(r: RecommendationRow) {
  return {
    id: r.id,
    studentId: r.studentId,
    courseId: r.courseId,
    courseName: r.courseName,
    topic: r.topic,
    recommendationType: r.recommendationType,
    title: r.title,
    message: r.message,
    reason: r.reason,
    priority: r.priority,
    status: r.status,
    userStory: r.userStory,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/recommendations/:studentId", async (req, res) => {
  const { studentId } = GetRecommendationsParams.parse(req.params);

  // Reconcile recommendations from the latest data before reading (US19).
  try {
    await generateRecommendations(studentId);
  } catch (err) {
    req.log?.warn({ err }, "Failed to generate recommendations");
  }

  const activeRows = await db
    .select()
    .from(recommendationsTable)
    .where(
      and(
        eq(recommendationsTable.studentId, studentId),
        eq(recommendationsTable.status, "active"),
      ),
    );

  const recommendations = [...activeRows]
    .sort(
      (a, b) =>
        (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    )
    .map(serialize);

  const improvements = await computeImprovement(studentId);

  const enrollments = await db
    .select()
    .from(studentCoursesTable)
    .where(eq(studentCoursesTable.studentId, studentId));
  const courseIds = enrollments.map((e) => e.courseId);
  const courseRows = courseIds.length
    ? await db
        .select()
        .from(coursesTable)
        .where(inArray(coursesTable.id, courseIds))
    : [];
  const courses = courseRows
    .map((c) => ({ courseId: c.id, courseName: c.courseName }))
    .sort((a, b) => a.courseName.localeCompare(b.courseName));

  const hasData = await hasAcademicData(studentId);

  res.json(
    GetRecommendationsResponse.parse({
      recommendations,
      improvements,
      courses,
      hasData,
      generatedAt: new Date().toISOString(),
    }),
  );
});

router.patch(
  "/recommendations/:studentId/items/:recommendationId",
  async (req, res) => {
    const { studentId, recommendationId } =
      UpdateRecommendationStatusParams.parse(req.params);
    const { status } = UpdateRecommendationStatusBody.parse(req.body);

    const [existing] = await db
      .select()
      .from(recommendationsTable)
      .where(
        and(
          eq(recommendationsTable.id, recommendationId),
          eq(recommendationsTable.studentId, studentId),
        ),
      );
    if (!existing) {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }

    // A manual status change clears the auto-completed flag so the engine will
    // not silently reactivate the student's explicit choice.
    const [updated] = await db
      .update(recommendationsTable)
      .set({ status, autoCompleted: false, updatedAt: new Date() })
      .where(
        and(
          eq(recommendationsTable.id, recommendationId),
          eq(recommendationsTable.studentId, studentId),
        ),
      )
      .returning();

    res.json(UpdateRecommendationStatusResponse.parse(serialize(updated)));
  },
);

export default router;
