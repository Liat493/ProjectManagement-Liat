import { weightedAverage, comparisonStatus, round2 } from "./business";

export type PerfLevel =
  | "excellent"
  | "good"
  | "average"
  | "needs_improvement"
  | "weak"
  | "none";

/**
 * Map a 0-100 metric (attendance % or average grade) onto the shared 5-level
 * performance scale used for heatmap colouring (US4). `null` -> "none".
 */
export function performanceLevel(value: number | null): PerfLevel {
  if (value === null || Number.isNaN(value)) return "none";
  if (value >= 90) return "excellent";
  if (value >= 80) return "good";
  if (value >= 70) return "average";
  if (value >= 60) return "needs_improvement";
  return "weak";
}

/**
 * Classify a course relative to the student's own overall average (US2/US3).
 * "Significantly" = more than 5 points away, matching comparisonStatus.
 */
export function courseStrength(
  courseAvg: number | null,
  studentOverall: number | null,
): "strong" | "weak" | "normal" | "none" {
  if (courseAvg === null || studentOverall === null) return "none";
  const diff = courseAvg - studentOverall;
  if (diff > 5) return "strong";
  if (diff < -5) return "weak";
  return "normal";
}

export type DateRow = { date: string };

/** Build month period buckets (e.g. 2026-01) covering all supplied dates. */
export function buildMonthPeriods(
  dates: ReadonlyArray<string>,
): Array<{ key: string; label: string }> {
  const keys = new Set<string>();
  for (const d of dates) {
    if (typeof d === "string" && d.length >= 7) keys.add(d.slice(0, 7));
  }
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return Array.from(keys)
    .sort()
    .map((key) => {
      const m = Number(key.slice(5, 7));
      const label = m >= 1 && m <= 12 ? monthNames[m - 1] : key;
      return { key, label };
    });
}

export function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

export { weightedAverage, comparisonStatus, round2 };
