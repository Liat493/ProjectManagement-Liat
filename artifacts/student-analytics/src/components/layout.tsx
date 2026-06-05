import React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  BarChart2,
  GraduationCap,
  CalendarClock,
  Target,
  ShieldAlert,
  GraduationCap as StudentIcon,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, student, logout } = useAuth();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/comparison", label: "Class Comparison", icon: BarChart2 },
    { href: "/averages", label: "Grade Averages", icon: GraduationCap },
    { href: "/schedule", label: "Weekly Schedule", icon: CalendarClock },
    { href: "/submissions", label: "Submission Rates", icon: Target },
    { href: "/alerts", label: "Risk Alerts", icon: ShieldAlert },
  ];

  const displayName = user?.fullName ?? "Student";
  const semester = student?.semester ?? "";

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col hidden md:flex shrink-0">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <StudentIcon size={24} />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground leading-none mb-1 truncate">{displayName}</h2>
              {semester && <span className="text-xs text-muted-foreground font-medium">{semester}</span>}
            </div>
          </div>
        </div>

        <nav className="flex-1 py-6 px-3 flex flex-col gap-1 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">
            Analytics Module
          </div>
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon size={18} className={isActive ? "text-primary" : "text-muted-foreground"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => void logout()}
          >
            <LogOut size={16} />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
