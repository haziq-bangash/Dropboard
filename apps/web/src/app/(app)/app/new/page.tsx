"use client";

import { suggestDashboard } from "@dropboard/engine";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DropZone } from "@/components/app/DropZone";
import { useProjects } from "@/components/app/projects-store";
import { loadFile } from "@/lib/ingest";
import { setLoaded } from "@/lib/loaded-data";
import { projectsApi } from "@/lib/projects";

export default function NewProject() {
  const router = useRouter();
  const { refresh } = useProjects();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(file: File) {
    setBusy(file.name);
    setError(null);
    try {
      const { title, profile } = await loadFile(file);
      const created = await projectsApi.create(suggestDashboard(title, profile), { fileName: file.name, rowCount: profile.rowCount });
      setLoaded({ projectId: created.id, fileName: file.name, profile });
      await refresh();
      router.push(`/app/p/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        New <em className="font-serif text-[1.14em] italic text-brand-text">project</em>
      </h1>
      <p className="mt-2 text-muted-foreground">Start from a spreadsheet. We build a first dashboard in your browser and save it as a project.</p>
      <div className="mt-8">
        <DropZone onFile={start} busyName={busy} error={error} />
      </div>
    </div>
  );
}
