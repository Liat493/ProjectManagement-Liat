import {
  pgTable,
  serial,
  text,
  integer,
  real,
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
