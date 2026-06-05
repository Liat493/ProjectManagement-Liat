import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  studentsTable,
  studySessionsTable,
  studentCoursesTable,
} from "@workspace/db";
import { logger } from "./logger";

const DEMO_EMAIL = "demo@student.com";
const DEMO_PASSWORD = "123456";
const DEMO_NAME = "Alex Cohen";
const DEMO_SEMESTER = "Winter Semester 2026";

/**
 * Ensure a demo user exists and is linked to the existing seeded student (id 1) when present.
 * If no student exists at all, this is a no-op (the regular DB seed handles that).
 */
export async function ensureDemoUser(): Promise<number | null> {
  try {
    const [existingUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, DEMO_EMAIL));
    if (existingUser) {
      // Return whatever student is linked to the demo user so downstream
      // seeding targets the correct student regardless of its id.
      const [linked] = await db
        .select()
        .from(studentsTable)
        .where(eq(studentsTable.userId, existingUser.id));
      return linked?.id ?? null;
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const [user] = await db
      .insert(usersTable)
      .values({ fullName: DEMO_NAME, email: DEMO_EMAIL, passwordHash })
      .returning();

    // Prefer linking to the existing demo student (id 1) if present and unlinked.
    const [seedStudent] = await db.select().from(studentsTable).where(eq(studentsTable.id, 1));
    if (seedStudent && seedStudent.userId == null) {
      await db
        .update(studentsTable)
        .set({ userId: user.id, email: DEMO_EMAIL })
        .where(eq(studentsTable.id, seedStudent.id));
      logger.info({ userId: user.id, studentId: seedStudent.id }, "Demo user linked to existing seed student");
      return seedStudent.id;
    }

    // Otherwise create a fresh student record (no academic data — preserves clean state).
    const [student] = await db
      .insert(studentsTable)
      .values({ userId: user.id, fullName: DEMO_NAME, email: DEMO_EMAIL, semester: DEMO_SEMESTER })
      .returning();
    logger.info({ userId: user.id, studentId: student.id }, "Demo user created with new student profile");
    return student.id;
  } catch (err) {
    logger.error({ err }, "Failed to ensure demo user");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Demo study-session data for Learning Habit Tracking (Sprint 5).
//
// Idempotent: only seeds when the student has NO study sessions yet. Sessions
// are anchored to "now" so the analytics (today summary, weekly consistency,
// trends) always look current. The shape is intentional:
//   • ~6 baseline weeks of healthy activity (5 active days/week, longer
//     sessions, clustered around typical study hours), then
//   • a recent 7-day slump (only 2 active days incl. today, short sessions)
// so the inconsistency engine reliably fires duration_drop + consistency_decline
// while US1 (today's summary) still shows real activity.
// ---------------------------------------------------------------------------

function atHour(base: Date, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export async function ensureDemoStudySessions(studentId = 1): Promise<void> {
  try {
    const [student] = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, studentId));
    if (!student) return; // nothing to attach demo sessions to

    const existing = await db
      .select()
      .from(studySessionsTable)
      .where(eq(studySessionsTable.studentId, studentId));
    if (existing.length > 0) return; // already seeded — keep idempotent

    const enrollments = await db
      .select()
      .from(studentCoursesTable)
      .where(eq(studentCoursesTable.studentId, studentId));
    const courseIds = enrollments.map((e) => e.courseId);
    const courseFor = (i: number): number | null =>
      courseIds.length ? courseIds[i % courseIds.length]! : null;

    const now = new Date();
    const today0 = new Date(now);
    today0.setHours(0, 0, 0, 0);

    const rows: Array<typeof studySessionsTable.$inferInsert> = [];
    let counter = 0;

    // Typical productive hours the demo student studies at (US4 peak hours).
    const peakHours = [9, 10, 14, 20, 21];

    // --- baseline: weeks 7..2 ago (healthy, consistent) -------------------
    // Day offsets within a week that are "active" (Mon, Tue, Wed, Thu, Sun-ish).
    const activeWeekdayOffsets = [0, 1, 2, 4, 6];
    for (let week = 7; week >= 2; week--) {
      for (const off of activeWeekdayOffsets) {
        const dayStart = new Date(today0);
        dayStart.setDate(dayStart.getDate() - (week * 7) + off);
        // 1–2 sessions that day.
        const sessionsToday = off % 2 === 0 ? 2 : 1;
        for (let s = 0; s < sessionsToday; s++) {
          const hour = peakHours[(counter + s) % peakHours.length]!;
          const minutes = 40 + ((counter * 7 + s * 13) % 31); // 40–70 min
          const started = atHour(dayStart, hour, (counter * 5) % 60);
          const ended = new Date(started.getTime() + minutes * 60_000);
          rows.push({
            studentId,
            courseId: courseFor(counter),
            startedAt: started,
            endedAt: ended,
            durationMinutes: minutes,
          });
          counter++;
        }
      }
    }

    // --- recent slump: last 7 days (only 2 active days incl. today) -------
    // Active 6 days ago and today; short sessions → duration_drop fires and
    // active-day count collapses vs baseline → consistency_decline fires.
    const slumpDays = [6, 0];
    for (const ago of slumpDays) {
      const dayStart = new Date(today0);
      dayStart.setDate(dayStart.getDate() - ago);
      const hour = ago === 0 ? 20 : 10;
      const minutes = 15 + (ago % 5); // 15–19 min (short)
      const started = atHour(dayStart, hour, 15);
      const ended = new Date(started.getTime() + minutes * 60_000);
      rows.push({
        studentId,
        courseId: courseFor(counter),
        startedAt: started,
        endedAt: ended,
        durationMinutes: minutes,
      });
      counter++;
    }

    await db.insert(studySessionsTable).values(rows);
    logger.info(
      { studentId, count: rows.length },
      "Seeded demo study sessions for habit tracking",
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure demo study sessions");
  }
}
