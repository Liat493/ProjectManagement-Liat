export function weightedAverage(
  items: ReadonlyArray<{ grade: number; weight: number }>,
): number | null {
  if (items.length === 0) return null;
  const sumW = items.reduce((s, g) => s + g.weight, 0);
  if (sumW === 0) return null;
  const sumGW = items.reduce((s, g) => s + g.grade * g.weight, 0);
  return Math.round((sumGW / sumW) * 100) / 100;
}

export function comparisonStatus(diff: number | null): string {
  if (diff === null) return "No Data";
  if (diff > 5) return "Above";
  if (diff < -5) return "Below";
  return "Close";
}

export function rateLabel(rate: number, target: number): string {
  if (rate >= 95) return "Excellent";
  if (rate >= target) return "Good";
  if (rate >= 60) return "Needs Improvement";
  return "Critical";
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
