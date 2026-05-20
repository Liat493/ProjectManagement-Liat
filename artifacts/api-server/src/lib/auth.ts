import type { Request, Response, NextFunction, RequestHandler } from "express";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    studentId?: number;
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session?.userId || !req.session?.studentId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
};

export function assertOwnsStudent(req: Request, res: Response, studentId: number): boolean {
  if (req.session?.studentId !== studentId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

export const ownStudentParam: RequestHandler<{ studentId?: string }> = (req, res, next) => {
  const param = req.params.studentId;
  if (param === undefined) {
    next();
    return;
  }
  const id = Number(param);
  if (!Number.isFinite(id) || id !== req.session?.studentId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
};

export function sanitizeUser(u: { id: number; fullName: string; email: string; role: string }) {
  return { id: u.id, fullName: u.fullName, email: u.email, role: u.role };
}

export function sanitizeStudent(s: { id: number; userId: number | null; fullName: string; email: string; semester: string }) {
  return { id: s.id, userId: s.userId, fullName: s.fullName, email: s.email, semester: s.semester };
}
