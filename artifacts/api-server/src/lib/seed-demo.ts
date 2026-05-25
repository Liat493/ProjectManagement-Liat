import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, studentsTable } from "@workspace/db";
import { logger } from "./logger";

const DEMO_EMAIL = "demo@student.com";
const DEMO_PASSWORD = "123456";
const DEMO_NAME = "Alex Cohen";
const DEMO_SEMESTER = "Winter Semester 2026";

/**
 * Ensure a demo user exists and is linked to the existing seeded student (id 1) when present.
 * If no student exists at all, this is a no-op (the regular DB seed handles that).
 */
export async function ensureDemoUser(): Promise<void> {
  try {
    const [existingUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, DEMO_EMAIL));
    if (existingUser) return;

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
      return;
    }

    // Otherwise create a fresh student record (no academic data — preserves clean state).
    const [student] = await db
      .insert(studentsTable)
      .values({ userId: user.id, fullName: DEMO_NAME, email: DEMO_EMAIL, semester: DEMO_SEMESTER })
      .returning();
    logger.info({ userId: user.id, studentId: student.id }, "Demo user created with new student profile");
  } catch (err) {
    logger.error({ err }, "Failed to ensure demo user");
  }
}
