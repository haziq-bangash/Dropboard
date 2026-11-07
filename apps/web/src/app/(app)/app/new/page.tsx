"use client";

import { DropZone } from "@/components/app/DropZone";
import { StarterGrid } from "@/components/app/StarterGrid";
import { useStartProject } from "@/lib/start-project";

export default function NewProject() {
  const start = useStartProject();

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        New{" "}
        <em className="font-serif text-[1.14em] italic text-brand-text">
          project
        </em>
      </h1>
      <p className="mt-2 text-muted-foreground">
        Start from a spreadsheet. We build a first dashboard in your browser and
        save it as a project.
      </p>
      <div className="mt-8">
        <DropZone
          onFile={(file) => start.mutate({ file })}
          busyName={start.isPending ? start.variables?.file.name : null}
          error={start.error?.message}
        />
      </div>
      <div className="mt-12">
        <StarterGrid />
      </div>
    </div>
  );
}
