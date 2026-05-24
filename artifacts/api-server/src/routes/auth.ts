import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  studentsTable,
  coursesTable,
  studentCoursesTable,
  gradesTable,
  assignmentsTable,
  submissionsTable,
  submissionGoalsTable,
} from "@workspace/db";
import { sanitizeUser, sanitizeStudent } from "../lib/auth";

const router: IRouter = Router();

const SignupBody = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required"),
    email: z.string().trim().toLowerCase().email("Valid email is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    semester: z.string().trim().optional().default("Spring 2026"),
  })
  .refine((d: { password: string; confirmPassword: string }) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

const LoginBody = z.object({
  email: z.string().trim().toLowerCase().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

function flattenZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid request";
}

async function seedSampleAcademicData(studentId: number) {
  const courses = await db.select().from(coursesTable);
  if (courses.length === 0) return;

  await db
    .insert(studentCoursesTable)
    .values(courses.map((c) => ({ studentId, courseId: c.id })));

  const today = new Date();
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };

  // Fixed date triples per historical semester so the trend chart looks
  // realistic for each term. Any unknown semester falls back to dates
  // relative to today (the original behaviour).
  const semesterDates: Record<string, [string, string, string]> = {
    "Semester A 2024": ["2024-03-05", "2024-04-10", "2024-05-12"],
    "Semester B 2024": ["2024-10-04", "2024-11-08", "2024-12-10"],
    "Semester A 2025": ["2025-03-06", "2025-04-10", "2025-05-14"],
  };

  const gradeRows = courses.flatMap((c, i) => {
    const dates = semesterDates[c.semester] ?? [
      isoDate(daysAgo(35)),
      isoDate(daysAgo(20)),
      isoDate(daysAgo(10)),
    ];
    return [
      {
        studentId,
        courseId: c.id,
        grade: 78 + ((i * 3) % 15),
        weight: 20,
        gradeType: "Quiz",
        gradeDate: dates[0],
      },
      {
        studentId,
        courseId: c.id,
        grade: 80 + ((i * 5) % 15),
        weight: 30,
        gradeType: "Assignment",
        gradeDate: dates[1],
      },
      {
        studentId,
        courseId: c.id,
        grade: 82 + ((i * 4) % 13),
        weight: 50,
        gradeType: "Midterm",
        gradeDate: dates[2],
      },
    ];
  });
  if (gradeRows.length) await db.insert(gradesTable).values(gradeRows);

  // Mark all currently-past assignments as submitted for a clean starting state
  const allAssignments = await db.select().from(assignmentsTable);
  const now = new Date();
  const past = allAssignments.filter((a) => new Date(a.dueDate) < now);
  if (past.length) {
    await db.insert(submissionsTable).values(
      past.map((a) => ({
        studentId,
        assignmentId: a.id,
        submittedAt: new Date(a.dueDate),
        status: "submitted" as const,
      })),
    );
  }

  await db.insert(submissionGoalsTable).values({ studentId, targetRate: 90 });
}

router.post("/auth/signup", async (req, res) => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: flattenZodError(parsed.error) });
    return;
  }
  const { fullName, email, password, semester } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ fullName, email, passwordHash })
    .returning();

  const [student] = await db
    .insert(studentsTable)
    .values({ userId: user.id, fullName, email, semester })
    .returning();

  try {
    await seedSampleAcademicData(student.id);
  } catch (err) {
    req.log?.warn({ err }, "Failed to seed sample academic data for new student");
  }

  req.session.regenerate((regenErr) => {
    if (regenErr) {
      req.log?.error({ err: regenErr }, "Session regenerate failed during signup");
      res.status(500).json({ error: "Could not establish session" });
      return;
    }
    req.session.userId = user.id;
    req.session.studentId = student.id;
    req.session.save((err) => {
      if (err) {
        req.log?.error({ err }, "Session save failed during signup");
        res.status(500).json({ error: "Could not establish session" });
        return;
      }
      res.status(201).json({
        success: true,
        message: "Account created successfully",
        user: sanitizeUser(user),
        student: sanitizeStudent(student),
      });
    });
  });
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: flattenZodError(parsed.error) });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.userId, user.id));
  if (!student) {
    res.status(500).json({ error: "Student profile not found for this account" });
    return;
  }

  req.session.regenerate((regenErr) => {
    if (regenErr) {
      req.log?.error({ err: regenErr }, "Session regenerate failed during login");
      res.status(500).json({ error: "Could not establish session" });
      return;
    }
    req.session.userId = user.id;
    req.session.studentId = student.id;
    req.session.save((err) => {
      if (err) {
        req.log?.error({ err }, "Session save failed during login");
        res.status(500).json({ error: "Could not establish session" });
        return;
      }
      res.json({
        success: true,
        message: "Login successful",
        user: sanitizeUser(user),
        student: sanitizeStudent(student),
      });
    });
  });
});

router.get("/auth/me", async (req, res) => {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.userId, user.id));
  if (!student) {
    res.status(404).json({ error: "Student profile not found" });
    return;
  }
  res.json({ user: sanitizeUser(user), student: sanitizeStudent(student) });
});

router.post("/auth/logout", (req, res) => {
  if (!req.session) {
    res.json({ success: true });
    return;
  }
  req.session.destroy((err) => {
    if (err) {
      req.log?.warn({ err }, "Session destroy failed");
    }
    res.clearCookie("sls.sid");
    res.json({ success: true });
  });
});

export default router;
