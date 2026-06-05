import React, { useState } from "react";
import {
  useGetHabits,
  getGetHabitsQueryKey,
  useUpdateHabitAlertStatus,
} from "@workspace/api-client-react";
import type {
  HabitsReport,
  HabitProductiveHour,
  HabitTrendPoint,
  HabitTrends as HabitTrendsType,
  HabitDayPattern,
  HabitSubmissionHabits,
  HabitAlert,
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
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  Clock,
  Flame,
  CalendarRange,
  Timer,
  Hourglass,
  TrendingUp,
  TrendingDown,
  Sunrise,
  CheckCircle2,
  Send,
  Inbox,
  BellRing,
  X,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartTooltip,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

type PeriodKey = "daily" | "weekly" | "monthly";

const PERIOD_LABEL: Record<PeriodKey, string> = {
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
};

function fmtMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  const rounded = Math.round(min);
  if (rounded < 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${period}`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "No activity yet";
  const then = new Date(iso);
  const diffMs = Date.now() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} hour${diffH === 1 ? "" : "s"} ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} day${diffD === 1 ? "" : "s"} ago`;
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function Habits() {
  const studentId = useStudentId();
  const { data, isLoading, isError } = useGetHabits(studentId, {
    query: { queryKey: getGetHabitsQueryKey(studentId) },
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <PageHeader
        title="Learning Habit Tracking"
        description="Understand how you actually study — daily focus, weekly consistency, your most productive hours, submission punctuality and habit trends, with early warnings when your routine slips."
        icon={Activity}
      />

      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load learning habit data. Please try again later.
          </AlertDescription>
        </Alert>
      ) : (
        <HabitsContent data={data} studentId={studentId} />
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function HabitsContent({
  data,
  studentId,
}: {
  data: HabitsReport;
  studentId: number;
}) {
  const hasSessions =
    data.weeklyConsistency.totalDaysStudied > 0 ||
    data.dailySummary.sessionCount > 0;

  if (!hasSessions) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-10">
      <InconsistencyAlerts alerts={data.alerts} studentId={studentId} />
      <DailySummary data={data} />
      <WeeklyConsistency data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AverageDuration data={data} />
        <ProductiveHours
          hours={data.productiveHours}
          peakHours={data.peakHours}
        />
      </div>
      <SubmissionHabits data={data.submissionHabits} />
      <HabitTrends trends={data.trends} />
    </div>
  );
}

// --- US1: daily study summary ----------------------------------------------
function DailySummary({
  data,
}: {
  data: HabitsReport;
}) {
  const { dailySummary } = data;
  return (
    <section className="space-y-4">
      <SectionTitle icon={Clock} title="Today at a glance" subtitle="Your study activity so far today (US1)." />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total study time"
          value={fmtMinutes(dailySummary.totalMinutes)}
          icon={Hourglass}
          tone="bg-primary/10 text-primary"
        />
        <MetricCard
          label="Sessions today"
          value={String(dailySummary.sessionCount)}
          icon={Activity}
          tone="bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
        />
        <MetricCard
          label="Avg session"
          value={fmtMinutes(dailySummary.averageMinutes)}
          icon={Timer}
          tone="bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400"
        />
        <MetricCard
          label="Last activity"
          value={fmtRelative(dailySummary.lastActivityAt)}
          icon={Sunrise}
          tone="bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-500"
          small
        />
      </div>
    </section>
  );
}

// --- US2: weekly consistency -----------------------------------------------
function WeeklyConsistency({
  data,
}: {
  data: HabitsReport;
}) {
  const { weeklyConsistency } = data;
  const maxMinutes = Math.max(
    1,
    ...weeklyConsistency.pattern.map((p) => p.minutes),
  );
  return (
    <section className="space-y-4">
      <SectionTitle
        icon={CalendarRange}
        title="Weekly consistency"
        subtitle="How regularly you studied over the last 7 days (US2)."
      />
      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InlineStat label="Active days" value={`${weeklyConsistency.activeDays}/7`} />
            <InlineStat label="Inactive days" value={String(weeklyConsistency.inactiveDays)} />
            <InlineStat
              label="Current streak"
              value={`${weeklyConsistency.currentStreak} day${weeklyConsistency.currentStreak === 1 ? "" : "s"}`}
              icon={Flame}
            />
            <InlineStat label="Total days studied" value={String(weeklyConsistency.totalDaysStudied)} />
          </div>
          <div className="flex items-end justify-between gap-2 pt-2">
            {weeklyConsistency.pattern.map((day) => (
              <DayBar key={day.date} day={day} maxMinutes={maxMinutes} />
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function DayBar({ day, maxMinutes }: { day: HabitDayPattern; maxMinutes: number }) {
  const heightPct = day.minutes > 0 ? Math.max(8, (day.minutes / maxMinutes) * 100) : 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-1 flex-col items-center gap-2 cursor-default">
          <div className="flex h-28 w-full items-end justify-center">
            {day.active ? (
              <div
                data-testid="day-bar"
                className="w-full max-w-[40px] rounded-t-md bg-primary/80 transition-all"
                style={{ height: `${heightPct}%` }}
              />
            ) : (
              <div className="w-full max-w-[40px] h-1 rounded bg-muted" />
            )}
          </div>
          <span className={`text-xs font-medium ${day.active ? "text-foreground" : "text-muted-foreground"}`}>
            {day.label}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          <span className="font-semibold">{day.date}</span>
          <br />
          {day.active
            ? `${fmtMinutes(day.minutes)} across ${day.sessions} session${day.sessions === 1 ? "" : "s"}`
            : "No study activity"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

// --- US3: average session duration with period selector --------------------
function AverageDuration({
  data,
}: {
  data: HabitsReport;
}) {
  const [period, setPeriod] = useState<PeriodKey>("weekly");
  const value = data.averageDurations[period];
  return (
    <section className="space-y-4">
      <SectionTitle
        icon={Timer}
        title="Average session duration"
        subtitle="Typical length of a focused study block (US3)."
      />
      <Card className="h-[calc(100%-3.5rem)]">
        <CardContent className="p-6 space-y-5">
          <PeriodSelector value={period} onChange={setPeriod} />
          <div className="flex flex-col items-center justify-center py-6">
            <span className="text-5xl font-bold text-foreground">
              {fmtMinutes(value)}
            </span>
            <span className="text-sm text-muted-foreground mt-2">
              average per session · {PERIOD_LABEL[period].toLowerCase()}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {(["daily", "weekly", "monthly"] as PeriodKey[]).map((p) => (
              <div
                key={p}
                className={`rounded-lg border p-3 ${p === period ? "border-primary/40 bg-primary/5" : "border-border"}`}
              >
                <p className="text-xs text-muted-foreground capitalize">{p}</p>
                <p className="text-sm font-semibold text-foreground">
                  {fmtMinutes(data.averageDurations[p])}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// --- US4: productive study hours -------------------------------------------
function ProductiveHours({
  hours,
  peakHours,
}: {
  hours: HabitProductiveHour[];
  peakHours: number[];
}) {
  const peakSet = new Set(peakHours);
  const maxMinutes = Math.max(1, ...hours.map((h) => h.totalMinutes));
  const chartData = hours.map((h) => ({
    hour: h.hour,
    label: fmtHour(h.hour),
    minutes: h.totalMinutes,
    sessions: h.sessionCount,
    isPeak: peakSet.has(h.hour),
  }));
  const hasData = hours.some((h) => h.totalMinutes > 0);

  return (
    <section className="space-y-4">
      <SectionTitle
        icon={Sunrise}
        title="Productive study hours"
        subtitle="When you focus best across the day (US4)."
      />
      <Card className="h-[calc(100%-3.5rem)]">
        <CardContent className="p-6 space-y-4">
          {peakHours.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 p-3">
              <Flame className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm text-foreground">
                Your peak study {peakHours.length === 1 ? "hour is" : "hours are"}{" "}
                <span className="font-semibold">
                  {peakHours.map(fmtHour).join(", ")}
                </span>
                . Schedule demanding work then.
              </p>
            </div>
          )}
          {hasData ? (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(h: number) => (h % 3 === 0 ? fmtHour(h) : "")}
                      tick={{ fontSize: 11 }}
                      stroke="currentColor"
                      className="text-muted-foreground"
                    />
                    <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                    <RechartTooltip
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0]!.payload as (typeof chartData)[number];
                        return (
                          <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                            <p className="font-semibold">{d.label}</p>
                            <p className="text-muted-foreground">
                              {fmtMinutes(d.minutes)} · {d.sessions} session{d.sessions === 1 ? "" : "s"}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="minutes" radius={[3, 3, 0, 0]}>
                      {chartData.map((d) => (
                        <Cell
                          key={d.hour}
                          fill={
                            d.isPeak
                              ? "hsl(var(--primary))"
                              : d.minutes > 0
                                ? "hsl(var(--primary) / 0.4)"
                                : "hsl(var(--muted))"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <HourHeatStrip hours={hours} maxMinutes={maxMinutes} peakSet={peakSet} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Not enough data to identify productive hours yet.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function HourHeatStrip({
  hours,
  maxMinutes,
  peakSet,
}: {
  hours: HabitProductiveHour[];
  maxMinutes: number;
  peakSet: Set<number>;
}) {
  return (
    <div className="flex gap-0.5">
      {hours.map((h) => {
        const intensity = h.totalMinutes / maxMinutes;
        const opacity = h.totalMinutes === 0 ? 0.08 : 0.25 + intensity * 0.75;
        return (
          <Tooltip key={h.hour}>
            <TooltipTrigger asChild>
              <div
                className="flex-1 h-3 rounded-sm cursor-default"
                style={{
                  backgroundColor: peakSet.has(h.hour)
                    ? "hsl(var(--primary))"
                    : `hsl(var(--primary) / ${opacity})`,
                }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                <span className="font-semibold">{fmtHour(h.hour)}</span> · {fmtMinutes(h.totalMinutes)}
              </p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

// --- US5: submission habits (on-time vs late) ------------------------------
function SubmissionHabits({
  data,
}: {
  data: HabitSubmissionHabits;
}) {
  const [courseId, setCourseId] = useState<number | "all">("all");
  const active =
    courseId === "all"
      ? data.overall
      : data.byCourse.find((c) => c.courseId === courseId) ?? data.overall;

  const missing = Math.max(0, active.total - active.onTime - active.late);
  const segments = [
    { label: "On time", value: active.onTime, tone: "bg-emerald-500" },
    { label: "Late", value: active.late, tone: "bg-amber-500" },
    { label: "Missing", value: missing, tone: "bg-red-500" },
  ];
  const total = Math.max(1, active.total);

  return (
    <section className="space-y-4">
      <SectionTitle
        icon={Send}
        title="Submission habits"
        subtitle="Your punctuality on assignments — on-time vs late (US5)."
      />
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              label="All courses"
              active={courseId === "all"}
              onClick={() => setCourseId("all")}
            />
            {data.byCourse.map((c) => (
              <FilterChip
                key={c.courseId}
                label={c.courseName}
                active={courseId === c.courseId}
                onClick={() => setCourseId(c.courseId)}
              />
            ))}
          </div>

          {active.total === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No assignments with passed deadlines for this selection yet.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <SubStat label="On time" value={active.onTime} tone="text-emerald-600 dark:text-emerald-400" icon={CheckCircle2} />
                <SubStat label="Late" value={active.late} tone="text-amber-600 dark:text-amber-500" icon={Clock} />
                <SubStat label="Missing" value={missing} tone="text-red-600 dark:text-red-400" icon={X} />
              </div>

              <div className="space-y-2">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  {segments.map((s) =>
                    s.value > 0 ? (
                      <div
                        key={s.label}
                        className={s.tone}
                        style={{ width: `${(s.value / total) * 100}%` }}
                        title={`${s.label}: ${s.value}`}
                      />
                    ) : null,
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {segments.map((s) => (
                    <span key={s.label} className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-sm ${s.tone}`} />
                      {s.label} ({s.value})
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Submission rate:{" "}
                <span className="font-semibold text-foreground">{active.submissionRate}%</span>{" "}
                of {active.total} assignment{active.total === 1 ? "" : "s"} submitted
                {active.onTime + active.late > 0 && (
                  <>
                    {" "}— {Math.round((active.onTime / Math.max(1, active.onTime + active.late)) * 100)}% of those on time
                  </>
                )}
                .
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// --- US6: habit trends with range selector ---------------------------------
function HabitTrends({
  trends,
}: {
  trends: HabitTrendsType;
}) {
  const [range, setRange] = useState<PeriodKey>("daily");
  const series: HabitTrendPoint[] = trends[range];
  const RANGE_LABEL: Record<PeriodKey, string> = {
    daily: "Last 14 days",
    weekly: "Last 8 weeks",
    monthly: "Last 6 months",
  };

  return (
    <section className="space-y-4">
      <SectionTitle
        icon={TrendingUp}
        title="Habit trends"
        subtitle="How your study time is trending over time (US6)."
      />
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PeriodSelector value={range} onChange={setRange} />
            <span className="text-xs text-muted-foreground">{RANGE_LABEL[range]}</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                <RechartTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0]!.payload as HabitTrendPoint;
                    return (
                      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                        <p className="font-semibold">{label}</p>
                        <p className="text-muted-foreground">
                          {fmtMinutes(d.minutes)} · {d.sessions} session{d.sessions === 1 ? "" : "s"}
                        </p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="minutes"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "hsl(var(--primary))" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

// --- US7: inconsistency alerts ---------------------------------------------
function InconsistencyAlerts({
  alerts,
  studentId,
}: {
  alerts: HabitAlert[];
  studentId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dismissing, setDismissing] = useState<number | null>(null);

  const mutation = useUpdateHabitAlertStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetHabitsQueryKey(studentId),
        });
        toast({ title: "Alert dismissed" });
      },
      onError: () => {
        toast({
          title: "Could not dismiss alert",
          description: "Please try again.",
          variant: "destructive",
        });
      },
      onSettled: () => setDismissing(null),
    },
  });

  const meta: Record<string, { icon: React.ElementType; label: string }> = {
    inactivity: { icon: BellRing, label: "Inactivity" },
    duration_drop: { icon: Hourglass, label: "Shorter sessions" },
    consistency_decline: { icon: TrendingDown, label: "Consistency" },
  };
  const sevTone: Record<string, string> = {
    high: "border-l-red-500",
    medium: "border-l-amber-500",
    low: "border-l-blue-500",
  };
  const sevBadge: Record<string, string> = {
    high: "bg-destructive/10 text-destructive",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  };

  if (!alerts || alerts.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Your study habits are steady</p>
            <p className="text-sm text-muted-foreground">
              No inconsistencies detected — keep up the consistent routine.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <SectionTitle
        icon={BellRing}
        title="Inconsistency alerts"
        subtitle="Early warnings when your study routine slips (US7)."
        badge={`${alerts.length} active`}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {alerts.map((a) => {
          const m = meta[a.alertType] ?? { icon: BellRing, label: "Alert" };
          const Icon = m.icon;
          return (
            <Card key={a.id} className={`border-l-4 ${sevTone[a.severity] ?? sevTone.low}`}>
              <CardContent className="p-5 flex flex-col gap-3 h-full">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" /> {m.label}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${sevBadge[a.severity] ?? sevBadge.low}`}>
                    {a.severity}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground leading-snug">{a.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{a.message}</p>
                </div>
                <button
                  type="button"
                  data-testid={`dismiss-${a.id}`}
                  disabled={mutation.isPending && dismissing === a.id}
                  onClick={() => {
                    setDismissing(a.id);
                    mutation.mutate({
                      studentId,
                      alertId: a.id,
                      data: { status: "dismissed" },
                    });
                  }}
                  className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 self-start"
                >
                  <X className="h-3.5 w-3.5" />
                  {mutation.isPending && dismissing === a.id ? "Dismissing…" : "Dismiss"}
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

// --- shared building blocks ------------------------------------------------
function SectionTitle({
  icon: Icon,
  title,
  subtitle,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {badge && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
            {badge}
          </span>
        )}
      </div>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  small,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone: string;
  small?: boolean;
}) {
  return (
    <Card className="h-full">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
            <h3 className={`font-bold text-foreground ${small ? "text-xl" : "text-3xl"}`}>
              {value}
            </h3>
          </div>
          <div className={`p-3 rounded-lg shrink-0 ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InlineStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className="text-2xl font-bold text-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-5 w-5 text-amber-500" />}
        {value}
      </p>
    </div>
  );
}

function SubStat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-border p-4 text-center">
      <Icon className={`h-5 w-5 mx-auto mb-1.5 ${tone}`} />
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (p: PeriodKey) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-1" role="tablist">
      {(["daily", "weekly", "monthly"] as PeriodKey[]).map((p) => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={value === p}
          data-testid={`period-${p}`}
          onClick={() => onChange(p)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
            value === p
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 border border-dashed rounded-xl bg-card">
      <div className="p-3 rounded-2xl bg-muted text-muted-foreground mb-4">
        <Inbox className="h-7 w-7" />
      </div>
      <h3 className="font-semibold text-foreground">No study activity yet</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Once you start logging study sessions, your habits — focus time,
        consistency, productive hours and trends — will appear here.
      </p>
    </div>
  );
}
