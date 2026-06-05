import React from "react";
import { Link } from "wouter";
import {
  useGetDashboard,
  getGetDashboardQueryKey,
  useGetAlerts,
  getGetAlertsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  BookOpen,
  Clock,
  AlertTriangle,
  Target,
  LayoutDashboard,
  CalendarDays,
  GraduationCap,
  ClipboardCheck,
  Users,
  ArrowRight,
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  Lightbulb,
  Grid3x3,
  Activity,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/page-header";
import { useStudentId } from "@/contexts/auth-context";

export default function Dashboard() {
  const studentId = useStudentId();
  const { data, isLoading, isError } = useGetDashboard(studentId, {
    query: { queryKey: getGetDashboardQueryKey(studentId) },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load dashboard data. Please try again later.</AlertDescription>
      </Alert>
    );
  }

  const {
    studentName,
    overallAverage,
    bestCourse,
    weakestCourse,
    submissionRate,
    dueThisWeek,
    overdueCount,
    classComparisonSummary,
    attendanceRate,
    alerts,
  } = data;

  const attendanceSubtitle =
    attendanceRate >= 95
      ? "Excellent attendance"
      : attendanceRate >= 85
        ? "Good attendance"
        : attendanceRate >= 75
          ? "Needs improvement"
          : "Below 75% — critical";
  const attendanceTone =
    attendanceRate >= 85
      ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
      : attendanceRate >= 75
        ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-500"
        : "bg-destructive/10 text-destructive";

  // Split alerts: anything mentioning overdue/missed/below/critical is critical
  const criticalRe = /(overdue|missed|below|critical|past due)/i;
  const criticalAlerts = alerts.filter((a) => criticalRe.test(a));
  const warningAlerts = alerts.filter((a) => !criticalRe.test(a));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        title="Dashboard"
        description={`Here is where you stand today, ${studentName.split(" ")[0]}.`}
        icon={LayoutDashboard}
      />

      {(criticalAlerts.length > 0 || warningAlerts.length > 0) && (
        <div className="space-y-3">
          {criticalAlerts.map((alert, i) => (
            <Alert
              key={`c-${i}`}
              className="border-destructive/60 bg-destructive/5 text-destructive dark:bg-destructive/10"
            >
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertTitle className="text-destructive font-semibold">Action Required</AlertTitle>
              <AlertDescription className="ml-0 font-medium text-destructive/90">
                {alert}
              </AlertDescription>
            </Alert>
          ))}
          {warningAlerts.map((alert, i) => (
            <Alert
              key={`w-${i}`}
              className="bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-200"
            >
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
              <AlertDescription className="ml-2 font-medium">{alert}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          href="/averages"
          label="Overall Average"
          value={overallAverage ? `${overallAverage.toFixed(1)}%` : "—"}
          icon={BookOpen}
          iconTone="bg-primary/10 text-primary"
          subtitle={classComparisonSummary}
        />
        <StatCard
          href="/submissions"
          label="Submission Rate"
          value={`${submissionRate.toFixed(0)}%`}
          icon={Target}
          iconTone="bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
          subtitle="Across all courses"
        />
        <StatCard
          href="/averages"
          label="Attendance"
          value={`${attendanceRate.toFixed(0)}%`}
          icon={UserCheck}
          iconTone={attendanceTone}
          subtitle={attendanceSubtitle}
          highlight={attendanceRate > 0 && attendanceRate < 75}
        />
        <StatCard
          href="/schedule"
          label="Due This Week"
          value={String(dueThisWeek)}
          icon={Clock}
          iconTone={
            overdueCount > 0
              ? "bg-destructive/10 text-destructive"
              : "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-500"
          }
          subtitle={
            overdueCount > 0
              ? `${overdueCount} overdue assignment${overdueCount === 1 ? "" : "s"}`
              : "All caught up on past due"
          }
          subtitleTone={overdueCount > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}
          highlight={overdueCount > 0}
        />
        <Link href="/averages">
          <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30 flex flex-col h-full">
            <CardContent className="p-6 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-emerald-500" /> Strongest
                  </p>
                  <p className="font-semibold text-foreground line-clamp-1">{bestCourse || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                    <TrendingDown className="h-4 w-4 text-destructive" /> Needs Focus
                  </p>
                  <p className="font-semibold text-foreground line-clamp-1">{weakestCourse || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <RiskAlertsWidget studentId={studentId} />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Explore Modules</h2>
          <p className="text-sm text-muted-foreground mt-1">Jump straight into any analytics view.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ModuleCard
            href="/schedule"
            title="Weekly Schedule"
            description="View and manage your weekly assignments."
            icon={CalendarDays}
          />
          <ModuleCard
            href="/averages"
            title="Average Grade"
            description="Track your course averages and GPA."
            icon={GraduationCap}
          />
          <ModuleCard
            href="/submissions"
            title="Submission Rate"
            description="Analyze your submissions and missed work."
            icon={ClipboardCheck}
          />
          <ModuleCard
            href="/comparison"
            title="Class Comparison"
            description="Compare your performance to the class."
            icon={Users}
          />
          <ModuleCard
            href="/heatmap"
            title="Heatmap Analytics"
            description="See attendance and grade patterns at a glance."
            icon={Grid3x3}
          />
          <ModuleCard
            href="/habits"
            title="Habit Tracking"
            description="Track study focus, consistency and productive hours."
            icon={Activity}
          />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  href,
  label,
  value,
  icon: Icon,
  iconTone,
  subtitle,
  subtitleTone,
  highlight,
}: {
  href: string;
  label: string;
  value: string;
  icon: React.ElementType;
  iconTone: string;
  subtitle?: string;
  subtitleTone?: string;
  highlight?: boolean;
}) {
  return (
    <Link href={href}>
      <Card
        className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/30 h-full ${
          highlight ? "border-destructive/40 bg-destructive/5" : ""
        }`}
      >
        <CardContent className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
              <h3 className="text-3xl font-bold text-foreground">{value}</h3>
            </div>
            <div className={`p-3 rounded-lg ${iconTone}`}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
          {subtitle && (
            <p className={`text-sm font-medium mt-4 line-clamp-1 ${subtitleTone ?? "text-muted-foreground"}`}>
              {subtitle}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function RiskAlertsWidget({ studentId }: { studentId: number }) {
  const params = {
    status: "active" as const,
    sortBy: "severity" as const,
    sortDir: "desc" as const,
    page: 1,
    pageSize: 3,
  };
  const { data, isLoading, isError } = useGetAlerts(studentId, params, {
    query: { queryKey: getGetAlertsQueryKey(studentId, params) },
  });

  const sevStyle: Record<string, string> = {
    high: "bg-destructive/10 text-destructive border border-destructive/20",
    medium:
      "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-900/50",
    low: "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-900/50",
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" /> Risk Alerts
          </h2>
          {data && data.summary.active > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
              {data.summary.active} active
            </span>
          )}
        </div>
        <Link href="/alerts">
          <span className="text-sm font-medium text-primary hover:underline flex items-center gap-1 cursor-pointer">
            View all <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : isError || !data ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Risk alerts are unavailable right now.
          </CardContent>
        </Card>
      ) : data.alerts.length === 0 ? (
        <Card>
          <CardContent className="p-6 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-foreground">No active risk alerts</p>
              <p className="text-sm text-muted-foreground">
                You are on track across grades, attendance and submissions.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.alerts.map((a) => (
            <Card key={a.id} className="flex flex-col h-full">
              <CardContent className="p-5 flex flex-col gap-3 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${sevStyle[a.severity] ?? sevStyle.low}`}
                  >
                    {a.severity}
                  </span>
                  {a.courseName && (
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {a.courseName}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground leading-snug line-clamp-2">
                    {a.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {a.message}
                  </p>
                </div>
                <div className="mt-auto flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/10 p-2.5">
                  <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground/90 line-clamp-2">
                    {a.recommendation}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function ModuleCard({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/40 group h-full">
        <CardContent className="p-5 flex flex-col gap-3 h-full">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
