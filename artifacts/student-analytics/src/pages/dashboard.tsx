import React from "react";
import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, TrendingUp, TrendingDown, BookOpen, Clock, AlertTriangle, Target } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Dashboard() {
  const studentId = 1;
  const { data, isLoading, isError } = useGetDashboard(studentId, {
    query: { queryKey: getGetDashboardQueryKey(studentId) }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
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
    alerts
  } = data;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">Here is where you stand today, {studentName.split(' ')[0]}.</p>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, i) => (
            <Alert key={i} className="bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
              <AlertDescription className="ml-2 font-medium">{alert}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Overall Average</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-3xl font-bold text-foreground">
                    {overallAverage ? `${overallAverage.toFixed(1)}%` : '—'}
                  </h3>
                </div>
              </div>
              <div className="p-3 bg-primary/10 rounded-lg">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-sm font-medium text-muted-foreground mt-4 line-clamp-1">
              {classComparisonSummary}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Submission Rate</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-3xl font-bold text-foreground">
                    {submissionRate.toFixed(0)}%
                  </h3>
                </div>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <p className="text-sm font-medium text-muted-foreground mt-4">
              Across all courses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Due This Week</p>
                <h3 className="text-3xl font-bold text-foreground">
                  {dueThisWeek}
                </h3>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-500" />
              </div>
            </div>
            <p className={`text-sm font-medium mt-4 ${overdueCount > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {overdueCount > 0 ? `${overdueCount} overdue assignments` : 'All caught up on past due'}
            </p>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardContent className="p-6 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-emerald-500" /> Strongest
                </p>
                <p className="font-semibold text-foreground line-clamp-1">{bestCourse || '—'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                  <TrendingDown className="h-4 w-4 text-destructive" /> Needs Focus
                </p>
                <p className="font-semibold text-foreground line-clamp-1">{weakestCourse || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
