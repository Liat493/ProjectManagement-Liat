import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";

import Dashboard from "@/pages/dashboard";
import Comparison from "@/pages/comparison";
import Averages from "@/pages/averages";
import Schedule from "@/pages/schedule";
import Submissions from "@/pages/submissions";
import Alerts from "@/pages/alerts";
import Heatmap from "@/pages/heatmap";
import Habits from "@/pages/habits";
import { GraduationCap } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
        <GraduationCap className="h-6 w-6 animate-pulse" />
      </div>
      <p className="text-sm text-muted-foreground">Loading your dashboard…</p>
    </div>
  );
}

function ProtectedShell() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (!user) return <Redirect to="/login" />;
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/comparison" component={Comparison} />
        <Route path="/averages" component={Averages} />
        <Route path="/schedule" component={Schedule} />
        <Route path="/submissions" component={Submissions} />
        <Route path="/heatmap" component={Heatmap} />
        <Route path="/habits" component={Habits} />
        <Route path="/alerts" component={Alerts} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (user) return <Redirect to="/" />;
  return <>{children}</>;
}

function AppRoutes() {
  const [location] = useLocation();
  if (location === "/login") {
    return <PublicOnly><LoginPage /></PublicOnly>;
  }
  if (location === "/signup") {
    return <PublicOnly><SignupPage /></PublicOnly>;
  }
  return <ProtectedShell />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
