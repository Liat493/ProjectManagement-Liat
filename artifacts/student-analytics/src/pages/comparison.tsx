import React from "react";
import { useGetComparison, getGetComparisonQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from "recharts";
import { format, parseISO } from "date-fns";
import { useStudentId } from "@/contexts/auth-context";

export default function Comparison() {
  const studentId = useStudentId();
  const { data, isLoading, isError } = useGetComparison(studentId, {
    query: { queryKey: getGetComparisonQueryKey(studentId) }
  });
  const [selectedCourseId, setSelectedCourseId] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load comparison data. Please try again later.</AlertDescription>
      </Alert>
    );
  }

  const { items, trend } = data;
  const selectedCourse = selectedCourseId
    ? items.find((i) => i.courseId === selectedCourseId) ?? null
    : null;

  const formatTrendDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "MMM d");
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeader
        title="Comparison to Class Average"
        description="Understand how your performance compares to anonymized class data."
        icon={Users}
      />

      <Card>
        <CardHeader>
          <CardTitle>Performance Trend</CardTitle>
          <CardDescription>Your overall average vs class average over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
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
                  domain={['dataMin - 5', 100]} 
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
                <Legend 
                  verticalAlign="top" 
                  height={36} 
                  iconType="circle"
                  wrapperStyle={{ fontSize: '14px', fontWeight: 500 }}
                />
                <Line 
                  name="You"
                  type="monotone" 
                  dataKey="studentAverage" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={3}
                  dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  name="Class Average"
                  type="monotone" 
                  dataKey="classAverage" 
                  stroke="hsl(var(--muted-foreground))" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compare a Specific Course</CardTitle>
          <CardDescription>Select a course to see your performance vs the class average over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {items.map((item) => {
              const isSelected = item.courseId === selectedCourseId;
              return (
                <button
                  key={item.courseId}
                  type="button"
                  onClick={() => setSelectedCourseId(isSelected ? null : item.courseId)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-border"
                  }`}
                >
                  {item.courseName}
                </button>
              );
            })}
          </div>

          {selectedCourse ? (
            <>
              <h3 className="text-lg font-semibold mb-2">
                {selectedCourse.courseName} - Your Performance vs Class Average
              </h3>
              {selectedCourse.trend.length > 0 ? (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selectedCourse.trend} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
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
                        domain={['dataMin - 5', 100]}
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
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '14px', fontWeight: 500 }} />
                      <Line
                        name="You"
                        type="monotone"
                        dataKey="studentAverage"
                        stroke="hsl(var(--primary))"
                        strokeWidth={3}
                        dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        name="Class Average"
                        type="monotone"
                        dataKey="classAverage"
                        stroke="hsl(var(--muted-foreground))"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No grades recorded yet for this course.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a course above to view its dedicated comparison graph.</p>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4">Course Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => {
            const isAbove = item.difference && item.difference > 0;
            const isBelow = item.difference && item.difference < 0;
            const diffText = item.difference 
              ? `${Math.abs(item.difference).toFixed(1)}% ${isAbove ? 'above' : 'below'} average`
              : 'Matched with average';
            
            let statusColor = "bg-muted text-muted-foreground";
            if (item.status === "Above") statusColor = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
            if (item.status === "Below") statusColor = "bg-destructive/10 text-destructive";

            const isSelected = item.courseId === selectedCourseId;

            return (
              <Card
                key={item.courseId}
                onClick={() => setSelectedCourseId(isSelected ? null : item.courseId)}
                className={`overflow-hidden cursor-pointer transition-shadow ${
                  isSelected ? "ring-2 ring-primary" : "hover:shadow-md"
                }`}>
                <CardContent className="p-0">
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-semibold text-lg line-clamp-1" title={item.courseName}>
                        {item.courseName}
                      </h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${statusColor}`}>
                        {item.status}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Your Average</p>
                        <p className="text-2xl font-bold">{item.studentAverage ? `${item.studentAverage.toFixed(1)}%` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Class Average</p>
                        <p className="text-2xl font-bold text-muted-foreground">{item.classAverage.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className={`px-6 py-3 border-t text-sm font-medium ${
                    isAbove 
                      ? 'bg-emerald-50/50 border-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-400' 
                      : isBelow 
                        ? 'bg-red-50/50 border-red-100 text-destructive dark:bg-red-950/20 dark:border-red-900/50' 
                        : 'bg-muted/50 border-border text-muted-foreground'
                  }`}>
                    {diffText}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
