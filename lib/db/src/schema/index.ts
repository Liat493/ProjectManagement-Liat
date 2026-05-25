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
