"use client";

import { useSidebar } from "@/components/ui/sidebar";
import { useProjects } from "./projects-store";

function Bar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number;
}) {
  const full = used >= max;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-sidebar-foreground/70">{label}</span>
        <span
          className={
            full ? "font-medium text-brand-text-strong" : "text-sidebar-foreground/70"
          }
        >
          {used} of {max}
        </span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-sidebar-border"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={used}
      >
        <div
          className={full ? "h-full bg-brand" : "h-full bg-sidebar-primary"}
          style={{
            width: `${Math.min(100, (used / Math.max(1, max)) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

/** How much of the free plan is used. Hidden when the sidebar is collapsed to icons. */
export function UsageMeter() {
  const { limits } = useProjects();
  const { state } = useSidebar();
  if (!limits || state === "collapsed") return null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-sidebar-border bg-background/60 p-3">
      <Bar
        label="Projects"
        used={limits.projects.used}
        max={limits.projects.max}
      />
      <Bar
        label="Published links"
        used={limits.publishedLinks.used}
        max={limits.publishedLinks.max}
      />
    </div>
  );
}
