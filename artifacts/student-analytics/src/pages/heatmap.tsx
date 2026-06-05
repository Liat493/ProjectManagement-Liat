import React, { useState } from "react";
import {
  useGetHeatmap,
  getGetHeatmapQueryKey,
} from "@workspace/api-client-react";
import type {
  HeatmapCourse,
  HeatmapCell,
  HeatmapRecommendation,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader } from "@/components/page-header";
import { useStudentId } from "@/contexts/auth-context";
import {
  Grid3x3,
  AlertCircle,
  CalendarCheck,
  GraduationCap,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  ArrowUpRight,
  ArrowDownRight,
  Inbox,
} from "lucide-react";

type ViewMode = "attendance" | "grades";

/** Shared 5-level performance scale (US4). Colour + label + non-colour cue. */
const LEVEL_META: Record<
  string,
  { label: string; cell: string; swatch: string; symbol: string }
> = {
  excellent: {
    label: "Excellent (90+)",
    cell: "bg-emerald-600 text-white border-emerald-700",
    swatch: "bg-emerald-600",
    symbol: "●●",
  },
  good: {
    label: "Good (80–89)",
    cell: "bg-emerald-300 text-emerald-950 border-emerald-400",
    swatch: "bg-emerald-300",
    symbol: "●",
  },
  average: {
    label: "Average (70–79)",
    cell: "bg-amber-300 text-amber-950 border-amber-400",
    swatch: "bg-amber-300",
    symbol: "◐",
  },
  needs_improvement: {
    label: "Needs work (60–69)",
    cell: "bg-orange-400 text-orange-950 border-orange-500",
    swatch: "bg-orange-400",
    symbol: "▽",
  },
  weak: {
    label: "Weak (<60)",
    cell: "bg-red-500 text-white border-red-600",
    swatch: "bg-red-500",
    symbol: "▼",
  },
  none: {
    label: "No data",
    cell: "bg-muted/40 text-muted-foreground border-dashed border-border",
    swatch: "bg-muted",
    symbol: "–",
  },
};

function levelMeta(level: string) {
  return LEVEL_META[level] ?? LEVEL_META.none!;
}

const ORDERED_LEVELS = [
  "excellent",
  "good",
  "average",
  "needs_improvement",
  "weak",
  "none",
] as const;

export default function Heatmap() {
  const studentId = useStudentId();
  const [view, setView] = useState<ViewMode>("attendance");

  const { data, isLoading, isError } = useGetHeatmap(studentId, {
    query: { queryKey: getGetHeatmapQueryKey(studentId) },
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <PageHeader
        title="Heatmap Analytics"
        description="Spot patterns at a glance — attendance and grade performance across your courses over the term, with strong/weak signals, class comparison and tailored recommendations."
        icon={Grid3x3}
      />

      {/* View toggle (US5) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          className="inline-flex rounded-lg border border-border bg-card p-1"
          role="tablist"
          aria-label="Heatmap view"
        >
          <ToggleButton
            active={view === "attendance"}
            onClick={() => setView("attendance")}
            icon={CalendarCheck}
            label="Attendance View"
            testId="view-attendance"
          />
          <ToggleButton
            active={view === "grades"}
            onClick={() => setView("grades")}
            icon={GraduationCap}
            label="Grades View"
            testId="view-grades"
          />
        </div>
        {data && data.studentOverallAverage !== null && (
          <p className="text-sm text-muted-foreground">
            Your overall average:{" "}
            <span className="font-semibold text-foreground">
              {data.studentOverallAverage}%
            </span>
          </p>
        )}
      </div>

      {/* Legend (US4) */}
      <Legend />

      {/* Loading / error / empty / content */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : isError || !data ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load heatmap analytics. Please try again later.
          </AlertDescription>
        </Alert>
      ) : data.courses.length === 0 || data.periods.length === 0 ? (
        <EmptyState />
      ) : (
        <HeatmapTable
          courses={data.courses}
          periods={data.periods}
          view={view}
        />
      )}

      {/* Recommendations (US7) */}
      {data && !isLoading && !isError && (
        <Recommendations items={data.recommendations} />
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon: Icon,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-card px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Performance scale
      </span>
      {ORDERED_LEVELS.map((lvl) => {
        const m = levelMeta(lvl);
        return (
          <span key={lvl} className="flex items-center gap-1.5 text-xs">
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded ${m.swatch}`}
              aria-hidden
            />
            <span className="font-mono text-[10px] text-muted-foreground w-4 text-center">
              {m.symbol}
            </span>
            <span className="text-muted-foreground">{m.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function HeatmapTable({
  courses,
  periods,
  view,
}: {
  courses: HeatmapCourse[];
  periods: Array<{ key: string; label: string }>;
  view: ViewMode;
}) {
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full border-collapse" data-testid="heatmap-table">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 min-w-[200px]">
                Course
              </th>
              {periods.map((p) => (
                <th
                  key={p.key}
                  className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 py-3 min-w-[72px]"
                >
                  {p.label}
                </th>
              ))}
              <th className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground px-4 py-3 min-w-[150px]">
                {view === "attendance" ? "Overall" : "Grade vs Class"}
              </th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => {
              const cells =
                view === "attendance" ? c.attendanceCells : c.gradeCells;
              return (
                <tr
                  key={c.courseId}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="sticky left-0 z-10 bg-card px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground text-sm">
                        {c.courseName}
                      </span>
                      {view === "grades" && <StrengthBadge strength={c.strength} />}
                    </div>
                  </td>
                  {cells.map((cell) => (
                    <td key={cell.periodKey} className="px-1.5 py-1.5 text-center">
                      <HeatCell cell={cell} view={view} courseName={c.courseName} />
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    {view === "attendance" ? (
                      <OverallAttendance course={c} />
                    ) : (
                      <ClassComparison course={c} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function HeatCell({
  cell,
  view,
  courseName,
}: {
  cell: HeatmapCell;
  view: ViewMode;
  courseName: string;
}) {
  const m = levelMeta(cell.level);
  const unit = view === "attendance" ? "%" : "";
  const display = cell.value === null ? "–" : `${cell.value}${unit}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-testid="heat-cell"
          className={`flex h-10 w-full min-w-[60px] flex-col items-center justify-center rounded border text-xs font-semibold ${m.cell}`}
        >
          <span>{display}</span>
          <span className="font-mono text-[9px] leading-none opacity-80" aria-hidden>
            {m.symbol}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          <span className="font-semibold">{courseName}</span>
          <br />
          {view === "attendance" ? "Attendance" : "Average grade"}:{" "}
          {cell.value === null ? "No data this period" : `${cell.value}${unit}`}
          <br />
          Level: {m.label}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function StrengthBadge({ strength }: { strength: string }) {
  if (strength === "strong") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
        <ArrowUpRight className="h-3 w-3" /> Strong
      </span>
    );
  }
  if (strength === "weak") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 text-[10px] font-semibold">
        <ArrowDownRight className="h-3 w-3" /> Weak
      </span>
    );
  }
  return null;
}

function OverallAttendance({ course }: { course: HeatmapCourse }) {
  const m = levelMeta(course.attendanceLevel);
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex h-3 w-3 rounded-full ${m.swatch}`} aria-hidden />
      <span className="text-sm font-semibold text-foreground">
        {course.overallAttendance === null
          ? "No data"
          : `${course.overallAttendance}%`}
      </span>
    </div>
  );
}

function ClassComparison({ course }: { course: HeatmapCourse }) {
  if (course.overallGrade === null) {
    return <span className="text-xs text-muted-foreground">No grades yet</span>;
  }
  const diff = course.gradeDifference;
  const status = course.comparisonStatus;
  const Icon =
    status === "Above" ? TrendingUp : status === "Below" ? TrendingDown : Minus;
  const tone =
    status === "Above"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "Below"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  const diffLabel =
    diff === null ? "" : `${diff > 0 ? "+" : ""}${diff} pts`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 cursor-default">
          <Icon className={`h-4 w-4 ${tone}`} />
          <span className="text-sm font-semibold text-foreground">
            {course.overallGrade}%
          </span>
          {diffLabel && (
            <span className={`text-xs font-medium ${tone}`}>{diffLabel}</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          Your average: <span className="font-semibold">{course.overallGrade}%</span>
          <br />
          Class average:{" "}
          <span className="font-semibold">
            {course.classAverage === null ? "N/A" : `${course.classAverage}%`}
          </span>
          <br />
          Difference:{" "}
          <span className="font-semibold">
            {diff === null ? "N/A" : `${diff > 0 ? "+" : ""}${diff} pts`}
          </span>{" "}
          ({status})
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function Recommendations({ items }: { items: HeatmapRecommendation[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">Recommendations</h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Generated from the patterns in your heatmap above.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((r) => (
          <RecommendationCard key={r.id} rec={r} />
        ))}
      </div>
    </section>
  );
}

function RecommendationCard({ rec }: { rec: HeatmapRecommendation }) {
  const tone =
    rec.type === "weak_course"
      ? "border-l-red-500"
      : rec.type === "low_attendance"
        ? "border-l-amber-500"
        : "border-l-emerald-500";
  const Icon =
    rec.type === "weak_course"
      ? TrendingDown
      : rec.type === "low_attendance"
        ? CalendarCheck
        : TrendingUp;
  const iconTone =
    rec.type === "weak_course"
      ? "text-red-600 dark:text-red-400"
      : rec.type === "low_attendance"
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";
  return (
    <Card className={`border-l-4 ${tone}`}>
      <CardContent className="p-5">
        <div className="flex gap-3">
          <div className="p-2 rounded-lg bg-muted shrink-0 h-fit">
            <Icon className={`h-5 w-5 ${iconTone}`} />
          </div>
          <div className="space-y-1 min-w-0">
            <h3 className="font-semibold text-foreground">{rec.title}</h3>
            <p className="text-sm text-muted-foreground">{rec.message}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 border border-dashed rounded-xl bg-card">
      <div className="p-3 rounded-2xl bg-muted text-muted-foreground mb-4">
        <Inbox className="h-7 w-7" />
      </div>
      <h3 className="font-semibold text-foreground">No heatmap data yet</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Once attendance and grades are recorded for your courses, your
        performance heatmap will appear here.
      </p>
    </div>
  );
}
