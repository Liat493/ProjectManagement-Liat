export * from "./generated/api";

// Re-export generated TS types explicitly, omitting `GetAveragesParams`
// (the query-params type) because it collides with the zod schema of the
// same name in `./generated/api` (path-params). The query-params zod
// schema is exported as `GetAveragesQueryParams` from `./generated/api`.
export type { AssignmentCompleteInput } from "./generated/types/assignmentCompleteInput";
export type { AveragesReport } from "./generated/types/averagesReport";
export type { ComparisonItem } from "./generated/types/comparisonItem";
export type { ComparisonReport } from "./generated/types/comparisonReport";
export type { ComparisonTrendPoint } from "./generated/types/comparisonTrendPoint";
export type { Course } from "./generated/types/course";
export type { CourseAverage } from "./generated/types/courseAverage";
export type { CourseSubmissionRate } from "./generated/types/courseSubmissionRate";
export type { DashboardSummary } from "./generated/types/dashboardSummary";
export type { Grade } from "./generated/types/grade";
export type { GradeBreakdown } from "./generated/types/gradeBreakdown";
export type { HealthStatus } from "./generated/types/healthStatus";
export type { AttendanceReport } from "./generated/types/attendanceReport";
export type { AttendanceCourse } from "./generated/types/attendanceCourse";
export type { MissedAssignment } from "./generated/types/missedAssignment";
export type { SubmissionGoal } from "./generated/types/submissionGoal";
export type { SubmissionGoalInput } from "./generated/types/submissionGoalInput";
export type { SubmissionRatePoint } from "./generated/types/submissionRatePoint";
export type { SubmissionRateReport } from "./generated/types/submissionRateReport";
export type { TrendPoint } from "./generated/types/trendPoint";
export type { WeeklyAssignment } from "./generated/types/weeklyAssignment";
export type { RiskAlert } from "./generated/types/riskAlert";
export type { AlertSummary } from "./generated/types/alertSummary";
export type { AlertsReport } from "./generated/types/alertsReport";
export type { AlertStatusInput } from "./generated/types/alertStatusInput";
export type { HeatmapPeriod } from "./generated/types/heatmapPeriod";
export type { HeatmapCell } from "./generated/types/heatmapCell";
export type { HeatmapCourse } from "./generated/types/heatmapCourse";
export type { HeatmapRecommendation } from "./generated/types/heatmapRecommendation";
export type { HeatmapReport } from "./generated/types/heatmapReport";
