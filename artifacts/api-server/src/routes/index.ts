import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import coursesRouter from "./courses";
import comparisonRouter from "./comparison";
import gradesRouter from "./grades";
import assignmentsRouter from "./assignments";
import submissionsRouter from "./submissions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(coursesRouter);
router.use(comparisonRouter);
router.use(gradesRouter);
router.use(assignmentsRouter);
router.use(submissionsRouter);

export default router;
