"use client";

import { SourcePicker } from "@/components/app/SourcePicker";
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
        Start from a file, pasted cells or a link. We build a first dashboard in
        your browser and save it as a project.
      </p>
      <div className="mt-8">
        <SourcePicker start={start} />
      </div>
      <div className="mt-12">
        <StarterGrid />
      </div>
    </div>
  );
}
