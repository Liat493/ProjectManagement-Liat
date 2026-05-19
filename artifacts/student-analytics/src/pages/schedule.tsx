import React from "react";
import { useGetWeeklyAssignments, useCompleteAssignment, getGetWeeklyAssignmentsQueryKey, getGetDashboardQueryKey, getGetSubmissionRateQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Calendar, CheckCircle2, Clock, CalendarDays, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, isPast } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

export default function Schedule() {
  const studentId = 1;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: assignments, isLoading, isError } = useGetWeeklyAssignments(studentId, {
    query: { queryKey: getGetWeeklyAssignmentsQueryKey(studentId) }
  });

  const completeMutation = useCompleteAssignment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Marked Complete", description: "Great job completing your assignment!" });
        queryClient.invalidateQueries({ queryKey: getGetWeeklyAssignmentsQueryKey(studentId) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(studentId) });
        queryClient.invalidateQueries({ queryKey: getGetSubmissionRateQueryKey(studentId) });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to mark complete. Please try again.", variant: "destructive" });
      }
    }
  });

  const handleComplete = (id: number) => {
    completeMutation.mutate({
      assignmentId: id,
      data: { studentId }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (isError || !assignments) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load schedule. Please try again later.</AlertDescription>
      </Alert>
    );
  }

  // Group assignments by urgency
  const overdue = assignments.filter(a => a.isOverdue && a.status !== 'Completed');
  const upcoming = assignments.filter(a => !a.isOverdue && a.status !== 'Completed');
  const completed = assignments.filter(a => a.status === 'Completed');

  const getUrgencyIcon = (urgency: string, isOverdue: boolean) => {
    if (isOverdue) return <AlertTriangle className="h-4 w-4 text-destructive" />;
    if (urgency === 'today' || urgency === 'tomorrow') return <Clock className="h-4 w-4 text-amber-500" />;
    return <CalendarDays className="h-4 w-4 text-primary" />;
  };

  const AssignmentCard = ({ assignment, disabled }: { assignment: any, disabled?: boolean }) => {
    const isCompleted = assignment.status === 'Completed';
    
    return (
      <Card className={`overflow-hidden transition-all ${isCompleted ? 'opacity-60 bg-muted/30' : 'hover:shadow-md'}`}>
        <div className="flex flex-col sm:flex-row">
          <div className={`w-full sm:w-2 sm:shrink-0 h-1 sm:h-auto ${
            isCompleted ? 'bg-emerald-500' : 
            assignment.isOverdue ? 'bg-destructive' : 
            assignment.urgency === 'today' ? 'bg-amber-500' : 
            'bg-primary'
          }`} />
          <CardContent className="p-5 flex-1 flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
                  {assignment.courseName}
                </span>
                {!isCompleted && (
                  <span className={`text-xs font-medium flex items-center gap-1 ${
                    assignment.isOverdue ? 'text-destructive' :
                    assignment.urgency === 'today' ? 'text-amber-600 dark:text-amber-500' :
                    'text-muted-foreground'
                  }`}>
                    {getUrgencyIcon(assignment.urgency, assignment.isOverdue)}
                    {assignment.urgency}
                  </span>
                )}
              </div>
              <h3 className={`text-lg font-semibold ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                {assignment.title}
              </h3>
              <p className="text-sm text-muted-foreground">{assignment.description}</p>
              
              <div className="flex items-center gap-1.5 mt-2 text-sm font-medium text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Due: {format(parseISO(assignment.dueDate), "EEEE, MMM d 'at' h:mm a")}
              </div>
            </div>
            
            <div className="shrink-0 mt-4 sm:mt-0">
              {isCompleted ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500 font-medium px-4 py-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-md">
                  <CheckCircle2 className="h-5 w-5" /> Completed
                </div>
              ) : (
                <Button 
                  onClick={() => handleComplete(assignment.id)} 
                  disabled={completeMutation.isPending || disabled}
                  className={assignment.isOverdue ? 'bg-destructive hover:bg-destructive/90' : ''}
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
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Weekly Schedule</h1>
        <p className="text-muted-foreground mt-1">Manage your upcoming deadlines and past-due items.</p>
      </div>

      {assignments.length === 0 ? (
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">Clear Schedule</h3>
            <p className="text-muted-foreground">You have no assignments due this week.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {overdue.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Past Due
              </h2>
              <div className="space-y-3">
                {overdue.map(a => <AssignmentCard key={a.id} assignment={a} />)}
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" /> Upcoming This Week
              </h2>
              <div className="space-y-3">
                {upcoming.map(a => <AssignmentCard key={a.id} assignment={a} />)}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div className="space-y-4 pt-4 border-t">
              <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" /> Completed
              </h2>
              <div className="space-y-3">
                {completed.map(a => <AssignmentCard key={a.id} assignment={a} disabled />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
