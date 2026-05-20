import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  date,
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
