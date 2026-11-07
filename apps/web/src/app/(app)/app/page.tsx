"use client";

import { FolderOpen, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ProjectCard } from "@/components/app/ProjectCard";
import { useProjects } from "@/components/app/projects-store";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Projects() {
  const { items, limits, error } = useProjects();
  const [message, setMessage] = useState<string | null>(null);
  const full = limits ? limits.projects.used >= limits.projects.max : false;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Your <em className="font-serif text-[1.14em] italic text-brand-text">projects</em>
          </h1>
          <p className="mt-2 text-muted-foreground">Each project is a dashboard built from one file. Your rows stay in your browser.</p>
        </div>
        <Button render={<Link href="/app/new" />} nativeButton={false} disabled={full}>
          <Plus /> New project
        </Button>
      </div>

      {full && (
        <Alert className="mt-6">
          <AlertDescription>
            You are using all {limits!.projects.max} projects on the free plan. Delete one to start another.
          </AlertDescription>
        </Alert>
      )}
      {(error || message) && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{message ?? error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-8">
        {!items ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-16 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-secondary/60">
              <FolderOpen className="size-6 text-brand-text" />
            </div>
            <div>
              <p className="text-lg font-medium">No projects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Drop a spreadsheet and your first dashboard is ready in seconds.</p>
            </div>
            <Button render={<Link href="/app/new" />} nativeButton={false}>
              <Plus /> Start a project
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <ProjectCard key={p.id} project={p} onError={setMessage} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
