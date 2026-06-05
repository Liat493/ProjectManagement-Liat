import { Router, type IRouter } from "express";
import { db, studySessionsTable, studyHabitAlertsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  GetHabitsParams,
  GetHabitsResponse,
  UpdateHabitAlertStatusParams,
  UpdateHabitAlertStatusBody,
  UpdateHabitAlertStatusResponse,
} from "@workspace/api-zod";
import {
  computeHabits,
  computeSubmissionHabits,
  generateHabitAlerts,
} from "../lib/habits";

const router: IRouter = Router();

type HabitAlertRow = typeof studyHabitAlertsTable.$inferSelect;

function serializeAlert(a: HabitAlertRow) {
  return {
    id: a.id,
    alertType: a.alertType,
    title: a.title,
    message: a.message,
    severity: a.severity,
    status: a.status,
    userStory: a.userStory,
    createdAt: a.createdAt.toISOString(),
  };
}

router.get("/habits/:studentId", async (req, res) => {
  const { studentId } = GetHabitsParams.parse(req.params);

  const sessions = await db
    .select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.studentId, studentId));

  const computed = computeHabits(sessions);

  // Refresh inconsistency alerts (US7) from the latest study data before read.
  try {
    await generateHabitAlerts(studentId, computed);
  } catch (err) {
    req.log?.warn({ err }, "Failed to generate habit alerts");
  }

  const submissionHabits = await computeSubmissionHabits(studentId);

  const alertRows = await db
    .select()
    .from(studyHabitAlertsTable)
    .where(
      and(
        eq(studyHabitAlertsTable.studentId, studentId),
        eq(studyHabitAlertsTable.status, "active"),
      ),
    );
  const sevRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const alerts = [...alertRows]
    .sort(
      (a, b) =>
        (sevRank[b.severity] ?? 0) - (sevRank[a.severity] ?? 0) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    )
    .map(serializeAlert);

  res.json(
    GetHabitsResponse.parse({
      dailySummary: computed.dailySummary,
      weeklyConsistency: computed.weeklyConsistency,
      averageDurations: computed.averageDurations,
      productiveHours: computed.productiveHours,
      peakHours: computed.peakHours,
      submissionHabits,
      trends: computed.trends,
      alerts,
      generatedAt: new Date().toISOString(),
    }),
  );
});

router.patch("/habits/:studentId/alerts/:alertId", async (req, res) => {
  const { studentId, alertId } = UpdateHabitAlertStatusParams.parse(req.params);
  const { status } = UpdateHabitAlertStatusBody.parse(req.body);

  const [existing] = await db
    .select()
    .from(studyHabitAlertsTable)
    .where(
      and(
        eq(studyHabitAlertsTable.id, alertId),
        eq(studyHabitAlertsTable.studentId, studentId),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  const [updated] = await db
    .update(studyHabitAlertsTable)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(studyHabitAlertsTable.id, alertId),
        eq(studyHabitAlertsTable.studentId, studentId),
      ),
    )
    .returning();

  res.json(UpdateHabitAlertStatusResponse.parse(serializeAlert(updated)));
});

export default router;
