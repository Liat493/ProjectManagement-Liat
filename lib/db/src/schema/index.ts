import {
  pgTable,
  serial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("student"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const studentsTable = pgTable("students", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  semester: text("semester").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  courseName: text("course_name").notNull(),
  courseCode: text("course_code").notNull(),
  semester: text("semester").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const studentCoursesTable = pgTable("student_courses", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  courseId: integer("course_id").notNull(),
});

export const gradesTable = pgTable("grades", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  courseId: integer("course_id").notNull(),
  grade: real("grade").notNull(),
  weight: real("weight").notNull(),
  gradeType: text("grade_type").notNull(),
  gradeDate: date("grade_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const classAveragesTable = pgTable("class_averages", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  averageGrade: real("average_grade").notNull(),
  averageSubmissionRate: real("average_submission_rate").notNull(),
  calculationDate: date("calculation_date").notNull(),
});

export const assignmentsTable = pgTable("assignments", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const submissionsTable = pgTable("submissions", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  assignmentId: integer("assignment_id").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  status: text("status").notNull(),
});

export const submissionGoalsTable = pgTable("submission_goals", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  targetRate: real("target_rate").notNull().default(90),
});

// Per-session attendance records. Aggregating these gives per-course and
// overall attendance percentages. Status is one of:
//   'present' | 'absent' | 'late' | 'excused'
// (late and present both count toward the attendance numerator; excused
// records are excluded from the denominator.)
export const attendanceRecordsTable = pgTable(
  "attendance_records",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull(),
    courseId: integer("course_id").notNull(),
    sessionDate: date("session_date").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    studentIdx: index("attendance_records_student_idx").on(t.studentId),
    studentCourseIdx: index("attendance_records_student_course_idx").on(
      t.studentId,
      t.courseId,
    ),
  }),
);

// Per-(student, course) snapshot of the overall/final course grade.
// The live dashboard still computes weighted averages dynamically from
// `grades`; this table stores end-of-term snapshots so analytics can
// report finalised grades alongside in-progress averages.
export const courseFinalGradesTable = pgTable(
  "course_final_grades",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull(),
    courseId: integer("course_id").notNull(),
    finalGrade: real("final_grade").notNull(),
    letterGrade: text("letter_grade"),
    term: text("term").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    studentIdx: index("course_final_grades_student_idx").on(t.studentId),
    uniq: uniqueIndex("course_final_grades_uniq").on(
      t.studentId,
      t.courseId,
      t.term,
    ),
  }),
);

// Sprint 3 — Risk Alerts module (US1–US7).
// Persistent store of generated risk alerts. Alerts are generated dynamically
// from existing academic data (grades, attendance, submissions) and upserted
// here so history is preserved across resolve/dismiss actions.
//   alertType: 'low_grade' (US1) | 'attendance' (US2) | 'declining_trend' (US3)
//              | 'missing_submission' (US4) | 'late_submission' (US4)
//              | 'high_risk_course' (US5)
//   severity:  'low' | 'medium' | 'high'
//   status:    'active' | 'resolved' | 'dismissed'
//   userStory: 'US1'..'US7' (traceability)
//   relatedKey: stable identifier of the underlying item (e.g. grade id,
//               course id, assignment id) used to de-duplicate generation.
//   riskScore:  populated for high_risk_course alerts (US5); null otherwise.
//   courseName: denormalised so history stays readable independently.
export const riskAlertsTable = pgTable(
  "risk_alerts",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull(),
    alertType: text("alert_type").notNull(),
    courseId: integer("course_id"),
    courseName: text("course_name"),
    title: text("title").notNull(),
    message: text("message").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("active"),
    recommendation: text("recommendation").notNull(),
    userStory: text("user_story").notNull(),
    relatedKey: text("related_key").notNull(),
    riskScore: real("risk_score"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    studentIdx: index("risk_alerts_student_idx").on(t.studentId),
    studentStatusIdx: index("risk_alerts_student_status_idx").on(
      t.studentId,
      t.status,
    ),
    uniq: uniqueIndex("risk_alerts_uniq").on(
      t.studentId,
      t.alertType,
      t.relatedKey,
    ),
  }),
);

// Sprint 5 — Learning Habit Tracking.
// Raw study-activity log for a student. Aggregating these powers the daily
// summary, weekly consistency, average session duration, productive-hours
// analysis and habit trends. A session is only counted as valid when it is
// complete (`endedAt` set) and has a positive `durationMinutes`; invalid or
// incomplete rows are ignored by all analytics.
export const studySessionsTable = pgTable(
  "study_sessions",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull(),
    courseId: integer("course_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    studentIdx: index("study_sessions_student_idx").on(t.studentId),
    studentStartedIdx: index("study_sessions_student_started_idx").on(
      t.studentId,
      t.startedAt,
    ),
  }),
);

// Sprint 5 — Learning Habit Tracking, US7.
// Kept deliberately SEPARATE from `risk_alerts` so the existing Risk Alerts
// module is untouched. Same generation/dedupe pattern: alerts are derived from
// study activity and upserted; the unique index makes generation idempotent so
// a dismissed alert is never resurrected for the same condition.
//   alertType: 'inactivity' | 'duration_drop' | 'consistency_decline'
//   severity:  'low' | 'medium' | 'high'
//   status:    'active' | 'dismissed'
//   relatedKey: stable identifier of the underlying episode used to de-dupe.
export const studyHabitAlertsTable = pgTable(
  "study_habit_alerts",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull(),
    alertType: text("alert_type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("active"),
    userStory: text("user_story").notNull(),
    relatedKey: text("related_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    studentIdx: index("study_habit_alerts_student_idx").on(t.studentId),
    studentStatusIdx: index("study_habit_alerts_student_status_idx").on(
      t.studentId,
      t.status,
    ),
    uniq: uniqueIndex("study_habit_alerts_uniq").on(
      t.studentId,
      t.alertType,
      t.relatedKey,
    ),
  }),
);

// Sprint 6 — Smart Recommendations (US15–US21, US36, US50).
// Persistent store of student-specific, data-derived recommendations. Like the
// Risk Alerts and Habit Alerts engines, recommendations are generated from the
// student's EXISTING data (grades, attendance, submissions, study activity,
// heatmap weak-area logic, risk alerts) and upserted here. The unique index on
// (student_id, recommendation_type, related_key) makes generation idempotent so
// re-running never creates duplicates (US19) and never resurrects a row the
// student completed or dismissed. Recommendations are course-scoped via
// courseId/courseName so they never mix across subjects (US21); a null courseId
// is a "General" recommendation.
//   recommendationType: 'low_grade' (US15) | 'weak_topic' (US16)
//              | 'weak_course' (US36) | 'low_attendance' (US36)
//              | 'low_submission' (US17) | 'risk_followup' (US50)
//              | 'habit_followup' (US17)
//   priority: 'low' | 'medium' | 'high'
//   status:   'active' | 'completed' | 'dismissed'
//   topic:    optional finer-grained area (e.g. grade type) when available.
//   reason:   short, human-readable "why this was generated" (US18).
//   sourceData: JSON snapshot of the metrics behind the recommendation.
//   relatedKey: stable identifier of the underlying condition used to de-dupe.
export const recommendationsTable = pgTable(
  "recommendations",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull(),
    courseId: integer("course_id"),
    courseName: text("course_name"),
    topic: text("topic"),
    recommendationType: text("recommendation_type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    reason: text("reason").notNull(),
    priority: text("priority").notNull(),
    status: text("status").notNull().default("active"),
    // True only when the engine auto-completed this row because its underlying
    // condition recovered. Lets generation reactivate it if the condition
    // returns, while NEVER reactivating a row the student manually completed or
    // dismissed (those keep autoCompleted = false).
    autoCompleted: boolean("auto_completed").notNull().default(false),
    sourceData: text("source_data"),
    userStory: text("user_story").notNull(),
    relatedKey: text("related_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    studentIdx: index("recommendations_student_idx").on(t.studentId),
    studentStatusIdx: index("recommendations_student_status_idx").on(
      t.studentId,
      t.status,
    ),
    uniq: uniqueIndex("recommendations_uniq").on(
      t.studentId,
      t.recommendationType,
      t.relatedKey,
    ),
  }),
);
