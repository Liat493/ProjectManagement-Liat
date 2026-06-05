import React, { useState } from "react";
import {
  useGetAlerts,
  getGetAlertsQueryKey,
  useUpdateAlertStatus,
} from "@workspace/api-client-react";
import type { GetAlertsParams, RiskAlert } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useStudentId } from "@/contexts/auth-context";
import { format, parseISO } from "date-fns";
import {
  AlertCircle,
  ShieldAlert,
  TrendingDown,
  UserX,
  Activity,
  FileX,
  Clock,
  AlertOctagon,
  Lightbulb,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

const ALL = "__all__";
const PAGE_SIZE = 8;

const COURSE_OPTIONS: Array<{ id: number; name: string }> = [
  { id: 1, name: "Calculus II" },
  { id: 2, name: "Introduction to Psychology" },
  { id: 3, name: "Data Structures" },
  { id: 4, name: "World History" },
  { id: 5, name: "Linear Algebra" },
  { id: 6, name: "English Literature" },
  { id: 7, name: "Introduction to Programming" },
  { id: 8, name: "Microeconomics" },
  { id: 9, name: "Statistics" },
  { id: 10, name: "Philosophy of Mind" },
];

const TYPE_META: Record<
  string,
  { label: string; us: string; icon: React.ElementType }
> = {
  low_grade: { label: "Low Grade", us: "US1", icon: TrendingDown },
  attendance: { label: "Attendance", us: "US2", icon: UserX },
  declining_trend: { label: "Declining Trend", us: "US3", icon: Activity },
  missing_submission: { label: "Missing Submission", us: "US4", icon: FileX },
  late_submission: { label: "Late Submission", us: "US4", icon: Clock },
  high_risk_course: { label: "High-Risk Course", us: "US5", icon: AlertOctagon },
};

function typeMeta(type: string) {
  return (
    TYPE_META[type] ?? { label: type, us: "", icon: ShieldAlert }
  );
}

const SEVERITY_STYLES: Record<
  string,
  { badge: string; border: string; dot: string }
> = {
  high: {
    badge:
      "bg-destructive/10 text-destructive border border-destructive/20",
    border: "border-l-destructive",
    dot: "bg-destructive",
  },
  medium: {
    badge:
      "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-900/50",
    border: "border-l-amber-500",
    dot: "bg-amber-500",
  },
  low: {
    badge:
      "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-900/50",
    border: "border-l-blue-500",
    dot: "bg-blue-500",
  },
};

function severityStyle(sev: string) {
  return SEVERITY_STYLES[sev] ?? SEVERITY_STYLES.low!;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-muted text-foreground",
    resolved:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    dismissed: "bg-muted text-muted-foreground line-through",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] ?? "bg-muted"}`}
    >
      {status}
    </span>
  );
}

export default function Alerts() {
  const studentId = useStudentId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<string>("active");
  const [alertType, setAlertType] = useState<string>(ALL);
  const [severity, setSeverity] = useState<string>(ALL);
  const [courseId, setCourseId] = useState<string>(ALL);
  const [sortBy, setSortBy] = useState<string>("date");
  const [sortDir, setSortDir] = useState<string>("desc");
  const [page, setPage] = useState<number>(1);

  const params: GetAlertsParams = {
    page,
    pageSize: PAGE_SIZE,
    sortBy: sortBy as GetAlertsParams["sortBy"],
    sortDir: sortDir as GetAlertsParams["sortDir"],
  };
  if (status !== ALL) params.status = status as GetAlertsParams["status"];
  if (alertType !== ALL) params.alertType = alertType;
  if (severity !== ALL) params.severity = severity as GetAlertsParams["severity"];
  if (courseId !== ALL) params.courseId = Number(courseId);

  const { data, isLoading, isError } = useGetAlerts(studentId, params, {
    query: { queryKey: getGetAlertsQueryKey(studentId, params) },
  });

  const updateMutation = useUpdateAlertStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetAlertsQueryKey(studentId),
        });
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to update the alert. Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  const changeFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const act = (alert: RiskAlert, next: "resolved" | "dismissed" | "active") => {
    updateMutation.mutate(
      { studentId, alertId: alert.id, data: { status: next } },
      {
        onSuccess: () =>
          toast({
            title:
              next === "resolved"
                ? "Alert resolved"
                : next === "dismissed"
                  ? "Alert dismissed"
                  : "Alert reactivated",
            description: alert.title,
          }),
      },
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <PageHeader
        title="Risk Alerts"
        description="Early warnings drawn from your grades, attendance and submissions — each with a recommended next step."
        icon={ShieldAlert}
      />

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            label="Active Alerts"
            value={data.summary.active}
            tone="bg-primary/10 text-primary"
            icon={ShieldAlert}
          />
          <SummaryCard
            label="High Severity"
            value={data.summary.high}
            tone="bg-destructive/10 text-destructive"
            icon={AlertOctagon}
            highlight={data.summary.high > 0}
          />
          <SummaryCard
            label="Resolved"
            value={data.summary.resolved}
            tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
            icon={CheckCircle2}
          />
          <SummaryCard
            label="Dismissed"
            value={data.summary.dismissed}
            tone="bg-muted text-muted-foreground"
            icon={XCircle}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          id="status-filter"
          label="Status"
          value={status}
          onChange={changeFilter(setStatus)}
          allLabel="All Statuses"
          options={[
            { value: "active", label: "Active" },
            { value: "resolved", label: "Resolved" },
            { value: "dismissed", label: "Dismissed" },
          ]}
        />
        <FilterSelect
          id="type-filter"
          label="Type"
          value={alertType}
          onChange={changeFilter(setAlertType)}
          allLabel="All Types"
          options={Object.entries(TYPE_META).map(([value, m]) => ({
            value,
            label: m.label,
          }))}
        />
        <FilterSelect
          id="severity-filter"
          label="Severity"
          value={severity}
          onChange={changeFilter(setSeverity)}
          allLabel="All Severities"
          options={[
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
        <FilterSelect
          id="course-filter"
          label="Course"
          value={courseId}
          onChange={changeFilter(setCourseId)}
          allLabel="All Courses"
          options={COURSE_OPTIONS.map((c) => ({
            value: String(c.id),
            label: c.name,
          }))}
        />
        <FilterSelect
          id="sort-filter"
          label="Sort by"
          value={sortBy}
          onChange={changeFilter(setSortBy)}
          options={[
            { value: "date", label: "Date" },
            { value: "severity", label: "Severity" },
          ]}
        />
        <FilterSelect
          id="dir-filter"
          label="Order"
          value={sortDir}
          onChange={changeFilter(setSortDir)}
          options={[
            { value: "desc", label: "Descending" },
            { value: "asc", label: "Ascending" },
          ]}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : isError || !data ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load risk alerts. Please try again later.
          </AlertDescription>
        </Alert>
      ) : data.alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 border border-dashed rounded-xl bg-card">
          <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 mb-4">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h3 className="font-semibold text-foreground">No alerts to show</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {status === "active"
              ? "You have no active risk alerts right now. Keep up the good work!"
              : "No alerts match the selected filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.alerts.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              onAct={act}
              pending={updateMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages} · {data.total} alert
            {data.total === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={data.page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertRow({
  alert,
  onAct,
  pending,
}: {
  alert: RiskAlert;
  onAct: (a: RiskAlert, next: "resolved" | "dismissed" | "active") => void;
  pending: boolean;
}) {
  const meta = typeMeta(alert.alertType);
  const sev = severityStyle(alert.severity);
  const Icon = meta.icon;
  return (
    <Card className={`border-l-4 ${sev.border}`}>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3 min-w-0">
            <div className="p-2.5 rounded-lg bg-muted text-foreground shrink-0 h-fit">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-foreground">{alert.title}</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${sev.badge}`}
                >
                  {alert.severity}
                </span>
                <StatusBadge status={alert.status} />
              </div>
              <p className="text-sm text-muted-foreground">{alert.message}</p>
              <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/10 p-3">
                <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-foreground/90">
                  {alert.recommendation}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-0.5">
                <span className="font-medium text-foreground/70">
                  {meta.label}
                </span>
                {alert.courseName && <span>· {alert.courseName}</span>}
                <span>· {format(parseISO(alert.createdAt), "MMM d, yyyy")}</span>
                {alert.riskScore !== null && (
                  <span>· Risk {alert.riskScore}/100</span>
                )}
                <span className="px-1.5 py-0.5 rounded bg-muted font-medium">
                  {meta.us}
                </span>
              </div>
            </div>
          </div>

          <div className="flex sm:flex-col gap-2 shrink-0">
            {alert.status === "active" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={pending}
                  onClick={() => onAct(alert, "resolved")}
                >
                  <CheckCircle2 className="h-4 w-4" /> Resolve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-muted-foreground"
                  disabled={pending}
                  onClick={() => onAct(alert, "dismissed")}
                >
                  <XCircle className="h-4 w-4" /> Dismiss
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground"
                disabled={pending}
                onClick={() => onAct(alert, "active")}
              >
                <RotateCcw className="h-4 w-4" /> Reactivate
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: number;
  tone: string;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-destructive/40 bg-destructive/5" : ""}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {label}
            </p>
            <h3 className="text-3xl font-bold text-foreground">{value}</h3>
          </div>
          <div className={`p-2.5 rounded-lg ${tone}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  allLabel?: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger
            id={id}
            data-testid={id}
            className="w-[170px] bg-background"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
