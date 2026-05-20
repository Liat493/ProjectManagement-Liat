import React, { useState } from "react";
import { 
  useGetAverages, 
  getGetAveragesQueryKey,
  useGetStudentCourses,
  useAddGrade,
  useGetGradeBreakdown,
  getGetGradeBreakdownQueryKey,
  getGetDashboardQueryKey,
  getGetComparisonQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Plus, GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { format, parseISO } from "date-fns";

const gradeSchema = z.object({
  courseId: z.coerce.number().min(1, "Course is required"),
  grade: z.coerce.number().min(0).max(100, "Grade must be between 0 and 100"),
  weight: z.coerce.number().min(0.1, "Weight must be greater than 0"),
  gradeType: z.string().min(1, "Grade type is required"),
  gradeDate: z.string().min(1, "Date is required"),
});

type GradeFormValues = z.infer<typeof gradeSchema>;

export default function Averages() {
  const studentId = 1;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

  const { data: averagesData, isLoading: isLoadingAverages } = useGetAverages(studentId, {
    query: { queryKey: getGetAveragesQueryKey(studentId) }
  });

  const { data: coursesData } = useGetStudentCourses(studentId, {
    query: { queryKey: ['studentCourses', studentId] }
  });

  const { data: breakdownData, isLoading: isLoadingBreakdown } = useGetGradeBreakdown(
    studentId, 
    selectedCourseId || 0, 
    { query: { enabled: !!selectedCourseId, queryKey: getGetGradeBreakdownQueryKey(studentId, selectedCourseId || 0) } }
  );

  const addGradeMutation = useAddGrade({
    mutation: {
      onSuccess: () => {
        toast({ title: "Grade Added", description: "Your grade has been successfully recorded." });
        setIsAddOpen(false);
        form.reset();
        
        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: getGetAveragesQueryKey(studentId) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(studentId) });
        queryClient.invalidateQueries({ queryKey: getGetComparisonQueryKey(studentId) });
        if (selectedCourseId) {
          queryClient.invalidateQueries({ queryKey: getGetGradeBreakdownQueryKey(studentId, selectedCourseId) });
        }
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to add grade. Please try again.", variant: "destructive" });
      }
    }
  });

  const form = useForm<GradeFormValues>({
    resolver: zodResolver(gradeSchema),
    defaultValues: {
      courseId: 0,
      grade: 0,
      weight: 10,
      gradeType: "Assignment",
      gradeDate: format(new Date(), "yyyy-MM-dd")
    }
  });

  const onSubmit = (values: GradeFormValues) => {
    addGradeMutation.mutate({
      data: {
        studentId,
        ...values
      }
    });
  };

  if (isLoadingAverages) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-[350px] w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!averagesData) return null;

  const formatTrendDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "MMM d");
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <PageHeader
        title="Average Grade"
        description="Track your course averages, GPA, and grade trends over time."
        icon={GraduationCap}
        actions={
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="shrink-0 gap-2 shadow-sm">
                <Plus size={16} /> Add Grade
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Record New Grade</DialogTitle>
              <DialogDescription>Add a new grade to update your averages.</DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="courseId">Course</Label>
                <Controller
                  name="courseId"
                  control={form.control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value ? field.value.toString() : ""}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select course" />
                      </SelectTrigger>
                      <SelectContent>
                        {coursesData?.map(c => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.courseName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.courseId && <p className="text-sm text-destructive">{form.formState.errors.courseId.message}</p>}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="grade">Grade (%)</Label>
                  <Input id="grade" type="number" step="0.1" {...form.register("grade")} />
                  {form.formState.errors.grade && <p className="text-sm text-destructive">{form.formState.errors.grade.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (%)</Label>
                  <Input id="weight" type="number" step="0.1" {...form.register("weight")} />
                  {form.formState.errors.weight && <p className="text-sm text-destructive">{form.formState.errors.weight.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gradeType">Type</Label>
                  <Controller
                    name="gradeType"
                    control={form.control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Assignment">Assignment</SelectItem>
                          <SelectItem value="Quiz">Quiz</SelectItem>
                          <SelectItem value="Midterm">Midterm</SelectItem>
                          <SelectItem value="Final">Final</SelectItem>
                          <SelectItem value="Project">Project</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gradeDate">Date</Label>
                  <Input id="gradeDate" type="date" {...form.register("gradeDate")} />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button type="submit" disabled={addGradeMutation.isPending}>
                  {addGradeMutation.isPending ? "Saving..." : "Save Grade"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        }
      />

      <Card className="bg-primary text-primary-foreground shadow-md border-none overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <svg width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
        </div>
        <CardContent className="p-8">
          <p className="text-primary-foreground/80 font-medium mb-2 uppercase tracking-wider text-sm">Overall Cumulative Average</p>
          <div className="flex items-baseline gap-2">
            <h2 className="text-6xl font-bold tracking-tighter">
              {averagesData.overall ? averagesData.overall.toFixed(1) : '—'}
            </h2>
            <span className="text-2xl text-primary-foreground/70 font-semibold">%</span>
          </div>
          <div className="mt-4 inline-flex items-center rounded-full bg-black/20 px-3 py-1 text-sm font-medium text-primary-foreground backdrop-blur-sm">
            Across {averagesData.perCourse.length} courses • {averagesData.semesters[0]}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historical Trend</CardTitle>
          <CardDescription>Your running average over the semester</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={averagesData.trend} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
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
                <Area 
                  type="monotone" 
                  dataKey="average" 
                  stroke="hsl(var(--primary))" 
                  fillOpacity={1} 
                  fill="url(#colorAvg)" 
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4">Course Breakdowns</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {averagesData.perCourse.map((course) => (
            <Card 
              key={course.courseId} 
              className={`cursor-pointer transition-all hover:shadow-md ${selectedCourseId === course.courseId ? 'ring-2 ring-primary border-transparent' : 'hover:border-primary/30'}`}
              onClick={() => setSelectedCourseId(course.courseId)}
            >
              <CardContent className="p-6">
                <p className="text-sm font-medium text-muted-foreground mb-1 line-clamp-1" title={course.courseName}>{course.courseName}</p>
                <div className="flex justify-between items-end mt-2">
                  <h3 className="text-3xl font-bold">{course.average ? course.average.toFixed(1) : '—'}<span className="text-lg text-muted-foreground font-normal ml-0.5">%</span></h3>
                  <span className="text-xs text-muted-foreground font-medium px-2 py-1 bg-muted rounded-md">{course.gradeCount} grades</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {selectedCourseId && (
        <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>{breakdownData?.courseName || 'Loading...'}</CardTitle>
                <CardDescription>All graded items for this course</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCourseId(null)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingBreakdown ? (
              <div className="p-8 flex justify-center"><Skeleton className="h-8 w-8 rounded-full" /></div>
            ) : breakdownData?.grades.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No grades recorded for this course yet.</div>
            ) : (
              <div className="divide-y">
                {breakdownData?.grades.map((grade) => (
                  <div key={grade.id} className="flex justify-between items-center p-4 hover:bg-muted/30 transition-colors">
                    <div>
                      <div className="font-medium text-foreground">{grade.gradeType}</div>
                      <div className="text-sm text-muted-foreground mt-1 flex gap-3">
                        <span>{format(parseISO(grade.gradeDate), "MMM d, yyyy")}</span>
                        <span>Weight: {grade.weight}%</span>
                      </div>
                    </div>
                    <div className="text-xl font-bold bg-muted px-3 py-1 rounded-md">
                      {grade.grade}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
