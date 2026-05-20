import React from "react";
import type { LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1 text-base">{description}</p>
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
