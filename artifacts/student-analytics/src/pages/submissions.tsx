import React, { useState } from "react";
import { 
  useGetSubmissionRate, 
  getGetSubmissionRateQueryKey,
  useUpdateSubmissionGoal,
  useGetMissedAssignments,
  getGetMissedAssignmentsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Target, Pencil, AlertTriangle, FileX, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine
} from "recharts";
import { format, parseISO } from "date-fns";

import { useStudentId } from "@/contexts/auth-context";

export default function Submissions() {
  const studentId = useStudentId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGoalOpen, setIsGoalOpen] = useState(false);
  const [newGoal, setNewGoal] = useState<string>("");

  const { data: rates, isLoading: isLoadingRates, isError: isErrorRates } = useGetSubmissionRate(studentId, {
    query: { queryKey: getGetSubmissionRateQueryKey(studentId) }
  });

  const { data: missed, isLoading: isLoadingMissed } = useGetMissedAssignments(studentId, {
    query: { queryKey: getGetMissedAssignmentsQueryKey(studentId) }
  });

  const updateGoalMutation = useUpdateSubmissionGoal({
    mutation: {
      onSuccess: () => {
        toast({ title: "Goal Updated", description: "Your submission goal has been updated." });
        setIsGoalOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetSubmissionRateQueryKey(studentId) });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update goal.", variant: "destructive" });
      }
    }
  });

  const handleUpdateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(newGoal);
    if (isNaN(val) || val < 0 || val > 100) return;
    
    updateGoalMutation.mutate({
      studentId, data: { targetRate: val }
    });
  };

  const openGoalModal = () => {
    setNewGoal(rates?.target.toString() || "95");
    setIsGoalOpen(true);
  };

  if (isLoadingRates) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-40 rounded-xl md:col-span-2" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    );
  }

  if (isErrorRates || !rates) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load submission data. Please try again.</AlertDescription>
      </Alert>
    );
  }

  const formatTrendDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "MMM d");
    } catch (e) {
      return dateStr;
    }
  };

  let labelColor = "bg-muted text-muted-foreground";
  if (rates.label === "Excellent") labelColor = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (rates.label === "Good") labelColor = "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  if (rates.label === "Needs Improvement") labelColor = "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  if (rates.label === "Critical") labelColor = "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <PageHeader
        title="Submission Rate"
        description="Monitor your submission habits and compare your rate to your target."
        icon={ClipboardCheck}
        actions={
          <Dialog open={isGoalOpen} onOpenChange={setIsGoalOpen}>
            <Button variant="outline" className="gap-2" onClick={openGoalModal}>
              <Target size={16} /> Set Goal
            </Button>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Update Target Rate</DialogTitle>
              <DialogDescription>Set a personal goal for your overall submission rate.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleUpdateGoal} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Input 
                  type="number" 
                  min="0" max="100" 
                  value={newGoal} 
                  onChange={e => setNewGoal(e.target.value)} 
                  className="text-2xl h-14 text-center font-bold"
                />
                <p className="text-sm text-center text-muted-foreground">Target percentage (0-100%)</p>
              </div>
              <div className="pt-4 flex justify-end">
                <Button type="submit" disabled={updateGoalMutation.isPending}>
                  {updateGoalMutation.isPending ? "Saving..." : "Save Goal"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        }
      />

      {rates.alerts.length > 0 && (
        <div className="space-y-3">
          {rates.alerts.map((alert, i) => (
            <Alert key={i} className="bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
              <AlertDescription className="ml-2 font-medium">{alert}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Overall Rate</h3>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-5xl font-bold">{rates.overall.toFixed(0)}</span>
                  <span className="text-2xl text-muted-foreground font-semibold">%</span>
                </div>
              </div>
              <div className={`px-3 py-1 rounded-full text-sm font-semibold ${labelColor}`}>
                {rates.label}
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">Progress to Target ({rates.target}%)</span>
                <span className="text-muted-foreground">
                  {rates.overall >= rates.target ? 'Target Met!' : `${(rates.target - rates.overall).toFixed(1)}% to go`}
                </span>
              </div>
              <Progress value={(rates.overall / rates.target) * 100} className="h-3 bg-muted" />
            </div>

            <div className="grid grid-cols-4 gap-4 mt-8 pt-6 border-t">
              <div className="text-center">
                <p className="text-2xl font-bold">{rates.total}</p>
                <p className="text-xs text-muted-foreground font-medium uppercase mt-1">Total</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{rates.submitted}</p>
                <p className="text-xs text-muted-foreground font-medium uppercase mt-1">Submitted</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-500">{rates.late}</p>
                <p className="text-xs text-muted-foreground font-medium uppercase mt-1">Late</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-destructive">{rates.missed}</p>
                <p className="text-xs text-muted-foreground font-medium uppercase mt-1">Missed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col bg-primary text-primary-foreground">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Class Comparison</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center pb-8">
            <div className="text-center">
              <p className="text-sm text-primary-foreground/70 mb-2">Class Average</p>
              <p className="text-4xl font-bold">{rates.classAverage.toFixed(0)}%</p>
              
              <div className="mt-6 p-4 rounded-xl bg-black/20 backdrop-blur-sm">
                <p className="font-medium text-sm">
                  {rates.overall > rates.classAverage 
                    ? `You submit ${(rates.overall - rates.classAverage).toFixed(0)}% more often than peers.`
                    : `You submit ${(rates.classAverage - rates.overall).toFixed(0)}% less often than peers.`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Consistency Trend</CardTitle>
          <CardDescription>Your rolling submission rate over time vs target</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rates.trend} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatTrendDate}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  domain={['auto', 100]} 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                  }}
                  labelFormatter={formatTrendDate}
                />
                <ReferenceLine y={rates.target} stroke="hsl(var(--primary))" strokeDasharray="3 3" opacity={0.5} />
                <Line 
                  name="Rate"
                  type="stepAfter" 
                  dataKey="rate" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={3}
                  dot={{ r: 4, fill: 'hsl(var(--card))', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">Course Breakdown</h2>
          <div className="space-y-3">
            {rates.perCourse.map(course => (
              <div key={course.courseId} className="flex flex-col p-4 bg-card rounded-xl border">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium">{course.courseName}</h4>
                  <span className="font-bold">{course.rate.toFixed(0)}%</span>
                </div>
                <Progress value={course.rate} className="h-1.5 mb-3" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{course.submitted} / {course.total} submitted</span>
                  <span>Class: {course.classAverage.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4 text-destructive flex items-center gap-2">
            <FileX className="h-5 w-5" /> Missed Assignments
          </h2>
          
          {isLoadingMissed ? (
            <div className="space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            </div>
          ) : missed && missed.length > 0 ? (
            <div className="space-y-3">
              {missed.map(m => (
                <div key={m.id} className="flex items-start gap-4 p-4 bg-destructive/5 border border-destructive/20 rounded-xl">
                  <div className="p-2 bg-destructive/10 rounded-lg shrink-0 mt-0.5">
                    <FileX className="h-4 w-4 text-destructive" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground leading-none mb-1.5">{m.title}</h4>
                    <p className="text-sm text-muted-foreground mb-1">{m.courseName}</p>
                    <p className="text-xs text-destructive font-medium">Was due {format(parseISO(m.dueDate), "MMM d, yyyy")}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center bg-card rounded-xl border border-dashed">
              <p className="text-muted-foreground">You have no missed assignments. Keep it up!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
