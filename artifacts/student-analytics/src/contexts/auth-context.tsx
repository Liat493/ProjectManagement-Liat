import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type AuthUser = {
  id: number;
  fullName: string;
  email: string;
  role: string;
};

export type AuthStudent = {
  id: number;
  userId: number | null;
  fullName: string;
  email: string;
  semester: string;
};

type AuthState = {
  user: AuthUser;
  student: AuthStudent;
};

type AuthContextValue = {
  isLoading: boolean;
  user: AuthUser | null;
  student: AuthStudent | null;
  studentId: number | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: { fullName: string; email: string; password: string; confirmPassword: string; semester?: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const STORAGE_KEY = "sls.currentUser";

function readCachedAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthState;
    if (
      parsed?.user?.id != null &&
      parsed?.student?.id != null &&
      typeof parsed.user.fullName === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedAuth(value: AuthState | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota errors */
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const message = payload?.error || payload?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const cached = readCachedAuth();
  const [user, setUser] = useState<AuthUser | null>(cached?.user ?? null);
  const [student, setStudent] = useState<AuthStudent | null>(cached?.student ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  // Validate the session against the server on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/auth/me`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (cancelled) return;
        if (!res.ok) {
          setUser(null);
          setStudent(null);
          writeCachedAuth(null);
          return;
        }
        const data = (await res.json()) as AuthState;
        setUser(data.user);
        setStudent(data.student);
        writeCachedAuth(data);
      } catch {
        // Network failure: keep optimistic cached state so the user isn't logged out on transient errors.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyAuth = useCallback(
    (data: AuthState) => {
      setUser(data.user);
      setStudent(data.student);
      writeCachedAuth(data);
      queryClient.clear();
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await postJson<AuthState>(`${import.meta.env.BASE_URL}api/auth/login`, {
        email,
        password,
      });
      applyAuth(data);
    },
    [applyAuth],
  );

  const signup = useCallback(
    async (input: {
      fullName: string;
      email: string;
      password: string;
      confirmPassword: string;
      semester?: string;
    }) => {
      const data = await postJson<AuthState>(`${import.meta.env.BASE_URL}api/auth/signup`, input);
      applyAuth(data);
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${import.meta.env.BASE_URL}api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore network errors on logout */
    }
    setUser(null);
    setStudent(null);
    writeCachedAuth(null);
    queryClient.clear();
  }, [queryClient]);

  const value: AuthContextValue = {
    isLoading,
    user,
    student,
    studentId: student?.id ?? null,
    login,
    signup,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/** Hook for module pages: returns the authenticated student id, asserting it exists. */
export function useStudentId(): number {
  const { studentId } = useAuth();
  if (studentId == null) {
    throw new Error("useStudentId called without an authenticated student — protect the route with <ProtectedRoute>.");
  }
  return studentId;
}
