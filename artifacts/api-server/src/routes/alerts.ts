import { Router, type IRouter } from "express";
import { db, riskAlertsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  GetAlertsParams,
  GetAlertsQueryParams,
  GetAlertsResponse,
  UpdateAlertStatusParams,
  UpdateAlertStatusBody,
  UpdateAlertStatusResponse,
} from "@workspace/api-zod";
import { generateAlerts, sevRank, type Severity } from "../lib/alerts";

const router: IRouter = Router();

type AlertRow = typeof riskAlertsTable.$inferSelect;

function serialize(a: AlertRow) {
  return {
    id: a.id,
    studentId: a.studentId,
    alertType: a.alertType,
    courseId: a.courseId,
    courseName: a.courseName,
    title: a.title,
    message: a.message,
    severity: a.severity,
    status: a.status,
    recommendation: a.recommendation,
    userStory: a.userStory,
    riskScore: a.riskScore,
    createdAt: a.createdAt.toISOString(),
  };
}

router.get("/alerts/:studentId", async (req, res) => {
  const { studentId } = GetAlertsParams.parse(req.params);
  const query = GetAlertsQueryParams.parse(req.query);

  // Refresh alerts from the latest academic data before reading.
  try {
    await generateAlerts(studentId);
  } catch (err) {
    req.log?.warn({ err }, "Failed to generate risk alerts");
  }

  const all = await db
    .select()
    .from(riskAlertsTable)
    .where(eq(riskAlertsTable.studentId, studentId));

  // Summary is computed across the whole set, independent of the filters
  // applied below, so the dashboard widget always reflects the true picture.
  const active = all.filter((a) => a.status === "active");
  const summary = {
    active: active.length,
    high: active.filter((a) => a.severity === "high").length,
    medium: active.filter((a) => a.severity === "medium").length,
    low: active.filter((a) => a.severity === "low").length,
    resolved: all.filter((a) => a.status === "resolved").length,
    dismissed: all.filter((a) => a.status === "dismissed").length,
  };

  // Filtering (US6).
  let filtered = all;
  if (query.status) filtered = filtered.filter((a) => a.status === query.status);
  if (query.alertType)
    filtered = filtered.filter((a) => a.alertType === query.alertType);
  if (query.severity)
    filtered = filtered.filter((a) => a.severity === query.severity);
  if (query.courseId !== undefined)
    filtered = filtered.filter((a) => a.courseId === query.courseId);

  // Sorting (US6).
  const sortBy = query.sortBy ?? "date";
  const dir = query.sortDir ?? "desc";
  const mul = dir === "asc" ? 1 : -1;
  filtered = [...filtered].sort((a, b) => {
    let cmp: number;
    if (sortBy === "severity") {
      cmp =
        sevRank[a.severity as Severity] - sevRank[b.severity as Severity] ||
        a.createdAt.getTime() - b.createdAt.getTime();
    } else {
      cmp =
        a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;
    }
    return cmp * mul;
  });

  // Pagination (US6).
  const total = filtered.length;
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  res.json(
    GetAlertsResponse.parse({
      summary,
      alerts: pageItems.map(serialize),
      total,
      page,
      pageSize,
      totalPages,
    }),
  );
});

router.patch("/alerts/:studentId/:alertId", async (req, res) => {
  const { studentId, alertId } = UpdateAlertStatusParams.parse(req.params);
  const { status } = UpdateAlertStatusBody.parse(req.body);

  const [existing] = await db
    .select()
    .from(riskAlertsTable)
    .where(
      and(
        eq(riskAlertsTable.id, alertId),
        eq(riskAlertsTable.studentId, studentId),
      ),
    );
  if (!existing) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  const [updated] = await db
    .update(riskAlertsTable)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(riskAlertsTable.id, alertId),
        eq(riskAlertsTable.studentId, studentId),
      ),
    )
    .returning();

  res.json(UpdateAlertStatusResponse.parse(serialize(updated)));
});

export default router;
