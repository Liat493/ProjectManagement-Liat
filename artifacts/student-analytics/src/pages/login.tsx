import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GraduationCap, AlertCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function useDemo() {
    setEmail("demo@student.com");
    setPassword("123456");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Smart Learning System</h1>
          <p className="text-sm text-muted-foreground mt-1">Student Analytics Dashboard</p>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Sign in to access your analytics dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing in…</> : "Sign in"}
              </Button>
            </form>

            <div className="mt-4 p-3 rounded-md bg-muted/60 border border-border text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Demo account</p>
              <p>Email: <span className="font-mono">demo@student.com</span></p>
              <p>Password: <span className="font-mono">123456</span></p>
              <button
                type="button"
                onClick={useDemo}
                className="text-primary hover:underline font-medium"
                disabled={isSubmitting}
              >
                Fill in demo credentials
              </button>
            </div>

            <p className="text-sm text-muted-foreground text-center mt-6">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/signup")}
                className="text-primary hover:underline font-medium"
              >
                Create one
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
