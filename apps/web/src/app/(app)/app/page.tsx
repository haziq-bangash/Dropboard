"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GettingStarted } from "@/components/app/GettingStarted";
import { ProjectCard } from "@/components/app/ProjectCard";
import { StarterGrid } from "@/components/app/StarterGrid";
import { EmptyTile } from "@/components/marketing/bento";
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
            Your{" "}
            <em className="font-serif text-[1.14em] italic text-brand-text">
              projects
            </em>
          </h1>
          <p className="mt-2 text-muted-foreground">
            Each project is a dashboard built from one file. Your rows stay in
            your browser.
          </p>
        </div>
        <Button
          render={<Link href="/app/new" />}
          nativeButton={false}
          disabled={full}
        >
          <Plus /> New project
        </Button>
      </div>

      <GettingStarted />

      {full && (
        <Alert className="mt-6">
          <AlertDescription>
            You are using all {limits!.projects.max} projects on the free plan.
            Delete one to start another.
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
          <div className="flex flex-col gap-12">
            <EmptyTile tone="dashed" eyebrow="Your workspace" title="No projects yet">
              <p>Drop a spreadsheet and your first dashboard is ready in seconds.</p>
              <Button className="mt-5 rounded-full" size="lg" render={<Link href="/app/new" />} nativeButton={false}>
                <Plus /> Start a project
              </Button>
            </EmptyTile>
            <StarterGrid />
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
