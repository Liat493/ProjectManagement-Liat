import React, { useState } from "react";
import {
  useGetAverages,
  getGetAveragesQueryKey,
  useGetGradeBreakdown,
  getGetGradeBreakdownQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";

import { useStudentId } from "@/contexts/auth-context";

const ALL_SEMESTERS = "__all__";

export default function Averages() {
  const studentId = useStudentId();
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string>(ALL_SEMESTERS);

  // Send `semester` to the API only when a specific one is selected.
  // Omitting the param preserves the original "all semesters" behaviour.
  const averagesParams =
    selectedSemester === ALL_SEMESTERS ? undefined : { semester: selectedSemester };

  const { data: averagesData, isLoading: isLoadingAverages } = useGetAverages(
    studentId,
    averagesParams,
    { query: { queryKey: getGetAveragesQueryKey(studentId, averagesParams) } },
  );

  const { data: breakdownData, isLoading: isLoadingBreakdown } = useGetGradeBreakdown(
    studentId,
    selectedCourseId || 0,
    { query: { enabled: !!selectedCourseId, queryKey: getGetGradeBreakdownQueryKey(studentId, selectedCourseId || 0) } },
  );

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
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Label htmlFor="semester-select" className="text-sm text-muted-foreground">Semester</Label>
          <div className="mt-1">
            <Select value={selectedSemester} onValueChange={setSelectedSemester}>
              <SelectTrigger id="semester-select" className="w-[240px]">
                <SelectValue placeholder="All semesters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SEMESTERS}>All semesters</SelectItem>
                {averagesData.semesters.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

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
            Across {averagesData.perCourse.length} courses • {selectedSemester === ALL_SEMESTERS ? "All semesters" : selectedSemester}
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
                {course.finalGrade !== null && course.finalGrade !== undefined && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Final: <span className="font-semibold text-foreground">{course.finalGrade.toFixed(1)}%</span>
                    {course.letterGrade ? <span className="ml-1.5 px-1.5 py-0.5 bg-primary/10 text-primary rounded font-semibold">{course.letterGrade}</span> : null}
                  </p>
                )}
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
