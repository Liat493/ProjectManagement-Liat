import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import coursesRouter from "./courses";
import comparisonRouter from "./comparison";
import gradesRouter from "./grades";
import assignmentsRouter from "./assignments";
import submissionsRouter from "./submissions";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);

// Everything below requires an authenticated session.
router.use(requireAuth);

// Ownership check for any route with a :studentId path parameter.
// `router.param` does NOT propagate into sub-routers mounted via `router.use`,
// so we register the check on each protected sub-router individually.
const ownStudentParam = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
  value: string,
) => {
  const id = Number(value);
  if (!Number.isFinite(id) || id !== req.session?.studentId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
};

for (const sub of [
  dashboardRouter,
  coursesRouter,
  comparisonRouter,
  gradesRouter,
  assignmentsRouter,
  submissionsRouter,
]) {
  sub.param("studentId", ownStudentParam);
}

router.use(dashboardRouter);
router.use(coursesRouter);
router.use(comparisonRouter);
router.use(gradesRouter);
router.use(assignmentsRouter);
router.use(submissionsRouter);

export default router;
