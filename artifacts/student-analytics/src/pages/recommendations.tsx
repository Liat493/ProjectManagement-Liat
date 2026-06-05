import React, { useMemo, useState } from "react";
import {
  useGetRecommendations,
  getGetRecommendationsQueryKey,
  useUpdateRecommendationStatus,
} from "@workspace/api-client-react";
import type {
  RecommendationsReport,
  Recommendation,
  CourseImprovement,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/page-header";
import { useStudentId } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Lightbulb,
  AlertCircle,
  CheckCircle2,
  X,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  BookOpen,
  Inbox,
  ShieldAlert,
  Target,
  Grid3x3,
  ClipboardList,
  Activity,
  LineChart,
} from "lucide-react";

type FilterKey = number | "all" | "general";

const TYPE_META: Record<
  string,
  { label: string; icon: React.ElementType }
> = {
  low_grade: { label: "Grade", icon: ClipboardList },
  weak_topic: { label: "Weak topic", icon: BookOpen },
  weak_course: { label: "Weak course", icon: Grid3x3 },
  low_attendance: { label: "Attendance", icon: Activity },
  low_submission: { label: "Submissions", icon: Target },
  risk_followup: { label: "Risk alert", icon: ShieldAlert },
  habit_followup: { label: "Study habits", icon: Activity },
};

const PRIORITY_TONE: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-blue-500",
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

export default function Recommendations() {
  const studentId = useStudentId();
  const { data, isLoading, isError } = useGetRecommendations(studentId, {
    query: { queryKey: getGetRecommendationsQueryKey(studentId) },
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <PageHeader
        title="Smart Recommendations"
        description="Personalised, data-driven suggestions generated from your grades, submissions, attendance, study activity and risk alerts — each with a clear reason and a way to track your progress."
        icon={Lightbulb}
      />

      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load recommendations. Please try again later.
          </AlertDescription>
        </Alert>
      ) : (
        <RecommendationsContent data={data} studentId={studentId} />
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function RecommendationsContent({
  data,
  studentId,
}: {
  data: RecommendationsReport;
  studentId: number;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  if (!data.hasData) {
    return <EmptyState />;
  }

  const recommendations = data.recommendations;

  const filtered = recommendations.filter((r) => {
    if (filter === "all") return true;
    if (filter === "general") return r.courseId == null;
    return r.courseId === filter;
  });

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <SectionTitle
          icon={Sparkles}
          title="Your recommendations"
          subtitle="Actionable suggestions tailored to your performance. Mark them completed as you act, or dismiss the ones that don't apply."
          badge={`${recommendations.length} active`}
        />

        {recommendations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              label="All"
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <FilterChip
              label="General"
              active={filter === "general"}
              onClick={() => setFilter("general")}
            />
            {data.courses.map((c) => (
              <FilterChip
                key={c.courseId}
                label={c.courseName}
                active={filter === c.courseId}
                onClick={() => setFilter(c.courseId)}
              />
            ))}
          </div>
        )}

        {recommendations.length === 0 ? (
          <AllClearCard />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-xl">
            No recommendations for this filter.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((r) => (
              <RecommendationCard
                key={r.id}
                rec={r}
                studentId={studentId}
              />
            ))}
          </div>
        )}
      </section>

      <ImprovementSection improvements={data.improvements} />
    </div>
  );
}

function RecommendationCard({
  rec,
  studentId,
}: {
  rec: Recommendation;
  studentId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<"completed" | "dismissed" | null>(
    null,
  );

  const mutation = useUpdateRecommendationStatus({
    mutation: {
      onSuccess: (_res, vars) => {
        queryClient.invalidateQueries({
          queryKey: getGetRecommendationsQueryKey(studentId),
        });
        toast({
          title:
            vars.data.status === "completed"
              ? "Marked as completed"
              : "Recommendation dismissed",
        });
      },
      onError: () => {
        toast({
          title: "Could not update recommendation",
          description: "Please try again.",
          variant: "destructive",
        });
      },
      onSettled: () => setPending(null),
    },
  });

  const meta = TYPE_META[rec.recommendationType] ?? {
    label: "Tip",
    icon: Lightbulb,
  };
  const TypeIcon = meta.icon;
  const isBusy = mutation.isPending;

  const act = (status: "completed" | "dismissed") => {
    setPending(status);
    mutation.mutate({
      studentId,
      recommendationId: rec.id,
      data: { status },
    });
  };

  return (
    <Card
      className={`border-l-4 ${PRIORITY_TONE[rec.priority] ?? PRIORITY_TONE.low}`}
    >
      <CardContent className="p-5 flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <TypeIcon className="h-3.5 w-3.5" /> {meta.label}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${PRIORITY_BADGE[rec.priority] ?? PRIORITY_BADGE.low}`}
          >
            {rec.priority}
          </span>
        </div>

        <div>
          <h3 className="font-semibold text-foreground leading-snug">
            {rec.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">{rec.message}</p>
        </div>

        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
            Why
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{rec.reason}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
            <BookOpen className="h-3 w-3" />
            {rec.courseName ?? "General"}
          </span>
          {rec.topic && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground capitalize">
              {rec.topic}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground ml-auto">
            {new Date(rec.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <button
            type="button"
            data-testid={`complete-${rec.id}`}
            disabled={isBusy}
            onClick={() => act("completed")}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {isBusy && pending === "completed" ? "Saving…" : "Mark completed"}
          </button>
          <button
            type="button"
            data-testid={`dismiss-${rec.id}`}
            disabled={isBusy}
            onClick={() => act("dismissed")}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            {isBusy && pending === "dismissed" ? "Dismissing…" : "Dismiss"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function ImprovementSection({
  improvements,
}: {
  improvements: CourseImprovement[];
}) {
  const tracked = useMemo(
    () => improvements.filter((i) => i.trend !== "insufficient_data"),
    [improvements],
  );

  return (
    <section className="space-y-4">
      <SectionTitle
        icon={LineChart}
        title="Improvement tracking"
        subtitle="How each course is trending over time — we compare your earlier results against your most recent ones (US20)."
      />
      {tracked.length === 0 ? (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Not enough graded work yet to show grade trends. Trends appear once a
            course has at least two grades.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tracked.map((i) => (
            <ImprovementCard key={i.courseId} item={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function ImprovementCard({ item }: { item: CourseImprovement }) {
  const config: Record<
    string,
    { icon: React.ElementType; tone: string; label: string }
  > = {
    improving: {
      icon: TrendingUp,
      tone: "text-emerald-600 dark:text-emerald-400",
      label: "Improving",
    },
    declining: {
      icon: TrendingDown,
      tone: "text-red-600 dark:text-red-400",
      label: "Declining",
    },
    stable: {
      icon: Minus,
      tone: "text-muted-foreground",
      label: "Stable",
    },
  };
  const c = config[item.trend] ?? config.stable;
  const Icon = c.icon;
  const deltaText =
    item.delta === null
      ? "—"
      : `${item.delta > 0 ? "+" : ""}${item.delta} pts`;

  return (
    <Card>
      <CardContent className="p-5 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground leading-snug">
            {item.courseName}
          </h3>
          <span className={`inline-flex items-center gap-1 text-sm font-semibold ${c.tone}`}>
            <Icon className="h-4 w-4" />
            {c.label}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground">
            {item.currentAverage != null ? `${item.currentAverage}%` : "—"}
          </span>
          <span className="text-xs text-muted-foreground">current average</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {item.earlierAverage != null ? `${item.earlierAverage}%` : "—"} →{" "}
            {item.laterAverage != null ? `${item.laterAverage}%` : "—"}
          </span>
          <span className={c.tone}>{deltaText}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function AllClearCard() {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold text-foreground">You're all caught up</p>
          <p className="text-sm text-muted-foreground">
            No active recommendations right now — keep up the great work. New
            suggestions will appear here as your data changes.
          </p>
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
      <h3 className="font-semibold text-foreground">No recommendations yet</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Once you have grades, submissions or attendance recorded, personalised
        recommendations will appear here to help you improve.
      </p>
    </div>
  );
}

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
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {badge && (
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {badge}
        </span>
      )}
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
