"use client";

import { suggestDashboard } from "@dropboard/engine";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DropZone } from "@/components/app/DropZone";
import { loadFile } from "@/lib/ingest";
import { authClient } from "@/lib/auth-client";
import { saveProjectData } from "@/lib/local-data";
import { newLoadId, setLoaded } from "@/lib/loaded-data";
import { useProjectMutations } from "@/lib/queries";

export default function NewProject() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { create } = useProjectMutations();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(file: File) {
    setBusy(file.name);
    setError(null);
    try {
      const { title, profile } = await loadFile(file);
      const created = await create.mutateAsync({ spec: suggestDashboard(title, profile), source: { fileName: file.name, rowCount: profile.rowCount } });
      setLoaded({ projectId: created.id, fileName: file.name, profile, loadId: newLoadId() });
      if (session) await saveProjectData(session.user.id, created.id);
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
