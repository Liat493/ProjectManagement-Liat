import React, { useMemo, useState } from "react";
import {
  useGetWeeklyAssignments,
  useCompleteAssignment,
  useGetStudentCourses,
  getGetWeeklyAssignmentsQueryKey,
  getGetDashboardQueryKey,
  getGetSubmissionRateQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  CalendarDays,
  AlertTriangle,
  Bell,
  List,
  LayoutGrid,
  BookOpen,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isSameDay, startOfWeek, addDays } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";

type Assignment = {
  id: number;
  title: string;
  description: string;
  courseId: number;
  courseName: string;
  dueDate: string;
  status: string;
  urgency: string;
  isOverdue: boolean;
  hoursUntilDue: number;
  completedAt: string | null;
  daysLate: number;
  isDueWithin24Hours: boolean;
};

const URGENCY_ORDER = ["Overdue", "Due Today", "Due Tomorrow", "Due Soon", "Upcoming", "Completed"];

const URGENCY_STYLE: Record<string, { badge: string; bar: string; text: string }> = {
  Overdue: { badge: "bg-destructive text-destructive-foreground", bar: "bg-destructive", text: "text-destructive" },
  "Due Today": { badge: "bg-amber-500 text-white", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-500" },
  "Due Tomorrow": { badge: "bg-amber-400 text-amber-950", bar: "bg-amber-400", text: "text-amber-700 dark:text-amber-400" },
  "Due Soon": { badge: "bg-primary text-primary-foreground", bar: "bg-primary", text: "text-primary" },
  Upcoming: { badge: "bg-muted text-muted-foreground", bar: "bg-muted-foreground/40", text: "text-muted-foreground" },
  Completed: { badge: "bg-emerald-500 text-white", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-500" },
};

export default function Schedule() {
  const studentId = 1;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "calendar">("list");

  const { data: assignmentsRaw, isLoading, isError } = useGetWeeklyAssignments(studentId, {
    query: { queryKey: getGetWeeklyAssignmentsQueryKey(studentId) },
  });
  const { data: courses } = useGetStudentCourses(studentId);

  const completeMutation = useCompleteAssignment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Marked Complete", description: "Nice work — that one is off your plate." });
        queryClient.invalidateQueries({ queryKey: getGetWeeklyAssignmentsQueryKey(studentId) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(studentId) });
        queryClient.invalidateQueries({ queryKey: getGetSubmissionRateQueryKey(studentId) });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to mark complete. Please try again.", variant: "destructive" });
      },
    },
  });

  const handleComplete = (id: number) => {
    completeMutation.mutate({ assignmentId: id, data: { studentId } });
  };

  const assignments: Assignment[] = (assignmentsRaw ?? []) as Assignment[];

  const filtered = useMemo(() => {
    if (courseFilter === "all") return assignments;
    const cid = Number(courseFilter);
    return assignments.filter((a) => a.courseId === cid);
  }, [assignments, courseFilter]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const completed = filtered.filter((a) => a.urgency === "Completed").length;
    const dueSoon24h = filtered.filter((a) => a.isDueWithin24Hours).length;
    const overdue = filtered.filter((a) => a.urgency === "Overdue").length;
    return { total, completed, dueSoon24h, overdue };
  }, [filtered]);

  const remindersList = useMemo(
    () => filtered.filter((a) => a.isDueWithin24Hours),
    [filtered],
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load schedule. Please try again later.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <PageHeader
        title="Weekly Submission Schedule"
        description="Manage your upcoming assignments, deadlines, and completed tasks."
        icon={CalendarDays}
      />

      <SummaryCards summary={summary} />

      {remindersList.length > 0 && <ReminderAlert items={remindersList} />}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <CourseFilter
          value={courseFilter}
          onChange={setCourseFilter}
          courses={(courses ?? []).map((c) => ({ id: c.id, name: c.courseName }))}
        />
        <ViewToggle value={view} onChange={setView} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState />
      ) : view === "list" ? (
        <ListView assignments={filtered} onComplete={handleComplete} isPending={completeMutation.isPending} />
      ) : (
        <CalendarView assignments={filtered} onComplete={handleComplete} isPending={completeMutation.isPending} />
      )}
    </div>
  );
}

/* ---------- summary cards ---------- */
function SummaryCards({
  summary,
}: {
  summary: { total: number; completed: number; dueSoon24h: number; overdue: number };
}) {
  const items = [
    { label: "This Week", value: summary.total, icon: CalendarDays, tone: "text-foreground" },
    { label: "Completed", value: summary.completed, icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-500" },
    { label: "Due in 24h", value: summary.dueSoon24h, icon: Bell, tone: "text-amber-600 dark:text-amber-500" },
    { label: "Overdue", value: summary.overdue, icon: AlertTriangle, tone: "text-destructive" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.label} className="overflow-hidden">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{it.label}</div>
                <div className={`text-3xl font-bold mt-1 ${it.tone}`}>{it.value}</div>
              </div>
              <Icon className={`h-7 w-7 ${it.tone} opacity-80`} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------- course filter ---------- */
function CourseFilter({
  value,
  onChange,
  courses,
}: {
  value: string;
  onChange: (v: string) => void;
  courses: Array<{ id: number; name: string }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <BookOpen className="h-4 w-4 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[240px]">
          <SelectValue placeholder="Filter by course" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Courses</SelectItem>
          {courses.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ---------- view toggle ---------- */
function ViewToggle({ value, onChange }: { value: "list" | "calendar"; onChange: (v: "list" | "calendar") => void }) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as "list" | "calendar")}>
      <TabsList>
        <TabsTrigger value="list" className="gap-1.5">
          <List className="h-4 w-4" /> List
        </TabsTrigger>
        <TabsTrigger value="calendar" className="gap-1.5">
          <LayoutGrid className="h-4 w-4" /> Calendar
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/* ---------- reminder alert ---------- */
function ReminderAlert({ items }: { items: Assignment[] }) {
  return (
    <Alert className="border-amber-400/60 bg-amber-50 dark:bg-amber-950/30">
      <Bell className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-200">
        You have {items.length} assignment{items.length === 1 ? "" : "s"} due within 24 hours
      </AlertTitle>
      <AlertDescription className="text-amber-900/80 dark:text-amber-100/80">
        {items.map((a) => a.title).join(" · ")}
      </AlertDescription>
    </Alert>
  );
}

/* ---------- assignment card ---------- */
function AssignmentCard({
  assignment,
  onComplete,
  isPending,
}: {
  assignment: Assignment;
  onComplete: (id: number) => void;
  isPending: boolean;
}) {
  const style = URGENCY_STYLE[assignment.urgency] ?? URGENCY_STYLE.Upcoming;
  const isCompleted = assignment.urgency === "Completed";
  const isOverdue = assignment.urgency === "Overdue";

  return (
    <Card
      className={`overflow-hidden transition-all ${
        isCompleted
          ? "opacity-75 bg-muted/30"
          : isOverdue
          ? "border-destructive/60 bg-destructive/5 shadow-sm"
          : "hover:shadow-md"
      }`}
    >
      <div className="flex">
        <div className={`w-1.5 shrink-0 ${style.bar}`} />
        <CardContent className="p-5 flex-1 flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="font-medium">
                {assignment.courseName}
              </Badge>
              <Badge className={style.badge}>{assignment.urgency}</Badge>
              {isOverdue && (
                <Badge variant="destructive" className="uppercase tracking-wider text-[10px]">
                  Action Required
                </Badge>
              )}
              {assignment.isDueWithin24Hours && !isCompleted && (
                <Badge className="bg-amber-500 text-white gap-1">
                  <Bell className="h-3 w-3" /> Within 24h
                </Badge>
              )}
            </div>

            <h3
              className={`text-lg font-semibold ${
                isCompleted ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {assignment.title}
            </h3>
            {assignment.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{assignment.description}</p>
            )}

            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5 font-medium">
                <CalendarIcon className="h-4 w-4" />
                {format(parseISO(assignment.dueDate), "EEE, MMM d 'at' h:mm a")}
              </span>
              {isOverdue && assignment.daysLate > 0 && (
                <span className={`font-semibold ${style.text}`}>
                  Overdue by {assignment.daysLate} day{assignment.daysLate === 1 ? "" : "s"}
                </span>
              )}
              {isCompleted && assignment.completedAt && (
                <span className="text-emerald-600 dark:text-emerald-500 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Completed {format(parseISO(assignment.completedAt), "MMM d")}
                  {assignment.daysLate > 0 ? ` (${assignment.daysLate}d late)` : ""}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0">
            {isCompleted ? (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500 font-medium px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-md">
                <CheckCircle2 className="h-5 w-5" /> Completed
              </div>
            ) : (
              <Button
                onClick={() => onComplete(assignment.id)}
                disabled={isPending}
                variant={isOverdue ? "destructive" : "default"}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark Complete
              </Button>
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

/* ---------- list view ---------- */
function ListView({
  assignments,
  onComplete,
  isPending,
}: {
  assignments: Assignment[];
  onComplete: (id: number) => void;
  isPending: boolean;
}) {
  const sections: Array<{ label: string; key: string; tone: string; icon: React.ElementType }> = [
    { label: "Overdue", key: "Overdue", tone: "text-destructive", icon: AlertTriangle },
    { label: "Due Today", key: "Due Today", tone: "text-amber-600 dark:text-amber-500", icon: Clock },
    { label: "Due Tomorrow", key: "Due Tomorrow", tone: "text-amber-700 dark:text-amber-400", icon: Clock },
    { label: "Later This Week", key: "later", tone: "text-primary", icon: CalendarDays },
    { label: "Completed", key: "Completed", tone: "text-muted-foreground", icon: CheckCircle2 },
  ];

  const grouped: Record<string, Assignment[]> = {
    Overdue: [],
    "Due Today": [],
    "Due Tomorrow": [],
    later: [],
    Completed: [],
  };
  for (const a of assignments) {
    if (a.urgency === "Due Soon" || a.urgency === "Upcoming") grouped.later.push(a);
    else if (grouped[a.urgency]) grouped[a.urgency].push(a);
  }

  return (
    <div className="space-y-8">
      {sections.map(({ label, key, tone, icon: Icon }) => {
        const items = grouped[key] ?? [];
        if (items.length === 0) return null;
        return (
          <section key={key} className="space-y-3">
            <h2 className={`text-sm font-semibold uppercase tracking-wider flex items-center gap-2 ${tone}`}>
              <Icon className="h-4 w-4" /> {label}
              <span className="text-xs text-muted-foreground font-normal">({items.length})</span>
            </h2>
            <div className="space-y-3">
              {items.map((a) => (
                <AssignmentCard key={a.id} assignment={a} onComplete={onComplete} isPending={isPending} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- calendar view ---------- */
function CalendarView({
  assignments,
  onComplete,
  isPending,
}: {
  assignments: Assignment[];
  onComplete: (id: number) => void;
  isPending: boolean;
}) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const overdueItems = assignments.filter((a) => a.urgency === "Overdue");

  return (
    <div className="space-y-4">
      {overdueItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" /> Overdue
            <span className="text-xs text-muted-foreground font-normal">({overdueItems.length})</span>
          </h2>
          <div className="space-y-3">
            {overdueItems.map((a) => (
              <AssignmentCard key={a.id} assignment={a} onComplete={onComplete} isPending={isPending} />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {days.map((day) => {
          const items = assignments.filter(
            (a) => a.urgency !== "Overdue" && isSameDay(parseISO(a.dueDate), day),
          );
          const isToday = isSameDay(day, new Date());
          return (
            <Card
              key={day.toISOString()}
              className={`min-h-[180px] ${isToday ? "border-primary/60 shadow-sm" : ""}`}
            >
              <CardContent className="p-3 space-y-2">
                <div
                  className={`flex items-baseline justify-between pb-2 border-b ${
                    isToday ? "border-primary/40" : "border-border"
                  }`}
                >
                  <div className={`text-xs font-semibold uppercase tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {format(day, "EEE")}
                  </div>
                  <div className={`text-lg font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                    {format(day, "d")}
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-4 text-center">No assignments</div>
                ) : (
                  <div className="space-y-2">
                    {items.map((a) => {
                      const style = URGENCY_STYLE[a.urgency] ?? URGENCY_STYLE.Upcoming;
                      const isCompleted = a.urgency === "Completed";
                      return (
                        <div
                          key={a.id}
                          className={`p-2 rounded-md border text-xs space-y-1 ${
                            isCompleted ? "bg-muted/40 opacity-75" : "bg-card hover:shadow-sm transition-shadow"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                              {a.courseName}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.badge}`}>
                              {a.urgency}
                            </span>
                          </div>
                          <div className={`font-semibold leading-tight ${isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {a.title}
                          </div>
                          <div className="text-muted-foreground">{format(parseISO(a.dueDate), "h:mm a")}</div>
                          {!isCompleted && (
                            <Button
                              size="sm"
                              variant={a.isOverdue ? "destructive" : "outline"}
                              className="w-full h-7 text-[11px] mt-1"
                              disabled={isPending}
                              onClick={() => onComplete(a.id)}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- empty ---------- */
function EmptyState() {
  return (
    <Card className="bg-muted/50 border-dashed">
      <CardContent className="p-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-1">Nothing here</h3>
        <p className="text-muted-foreground">No assignments match the current filter.</p>
      </CardContent>
    </Card>
  );
}
