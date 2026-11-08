"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  FileSpreadsheet,
  HardDrive,
  Link2Off,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AiPanel } from "@/components/AiPanel";
import { Dashboard } from "@/components/Dashboard";
import { PublishButton } from "@/components/PublishButton";
import { DropZone } from "@/components/app/DropZone";
import { InsightsPanel } from "@/components/app/InsightsPanel";
import { StoryPanel } from "@/components/app/StoryPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddChartMenu } from "@/components/app/AddChartMenu";
import { EmptyTile } from "@/components/marketing/bento";
import { PlacesMenu } from "@/components/app/PlacesMenu";
import { SampleNotice } from "@/components/SampleNotice";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { loadFile } from "@/lib/ingest";
import { localDataSupported } from "@/lib/local-data";
import {
  missingColumns,
  newLoadId,
  setLoaded,
  type LoadedData,
} from "@/lib/loaded-data";
import { ApiError, type ProjectDetail } from "@/lib/projects";
import {
  keys,
  useKeepOnDevice,
  useKept,
  useProject,
  useProjectData,
  useProjectMutations,
} from "@/lib/queries";
import { liveSource } from "@/lib/results";

/** Read a file for a project: it must have every column the dashboard uses. */
async function readForProject(
  project: ProjectDetail,
  file: File,
): Promise<LoadedData> {
  const { profile } = await loadFile(file);
  const gone = missingColumns(
    project.spec.schema.map((c) => c.name),
    profile,
  );
  if (gone.length) {
    throw new Error(
      `This file is missing columns the dashboard uses: ${gone.slice(0, 5).join(", ")}${gone.length > 5 ? "…" : ""}. Choose the original file or a newer version of it.`,
    );
  }
  const loaded = {
    projectId: project.id,
    fileName: file.name,
    profile,
    loadId: newLoadId(),
  };
  setLoaded(loaded);
  return loaded;
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;

  const projectQuery = useProject(id);
  const project = projectQuery.data;
  const dataQuery = useProjectData(
    userId,
    id,
    project?.sourceName,
    Boolean(project),
  );
  const kept = useKept(userId, id).data ?? false;
  const actions = useProjectMutations(userId);
  const device = useKeepOnDevice(userId, id);
  const attach = useMutation({
    mutationFn: async (file: File) => {
      const loaded = await readForProject(project!, file);
      await device.attach(loaded);
      return loaded;
    },
  });

  if (
    projectQuery.error instanceof ApiError &&
    projectQuery.error.status === 404
  ) {
    return (
      <div className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="text-2xl font-semibold">Project not found</h1>
        <p className="mt-2 text-muted-foreground">
          It may have been deleted, or it belongs to another account.
        </p>
        <Button
          className="mt-6"
          render={<Link href="/app" />}
          nativeButton={false}
        >
          Back to projects
        </Button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-8">
        {projectQuery.error ? (
          <Alert variant="destructive">
            <AlertDescription>{projectQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <Skeleton className="h-64 w-full rounded-xl" />
        )}
      </div>
    );
  }

  const data = dataQuery.data ?? null;
  const opening = dataQuery.isPending;
  // The attach step shows its own error; once the dashboard is open, problems show here
  const problem =
    (data ? attach.error?.message : null) ??
    actions.saveSpec.error?.message ??
    actions.rename.error?.message ??
    null;
  const refreshProject = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.project(id) }),
      client.invalidateQueries({ queryKey: keys.projects }),
    ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8">
      <div>
        <Link
          href="/app"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Projects
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {/* keyed by the saved title, so a rename (or Pilot retitling the dashboard) resets the field without an effect */}
          <TitleEditor
            key={project.title}
            title={project.title}
            onSave={(title) => actions.rename.mutateAsync({ id, title })}
          />
          {data && (
            <PublishButton
              spec={project.spec}
              projectId={id}
              onPublished={() => void refreshProject()}
            />
          )}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <FileSpreadsheet className="size-4" />
          {project.sourceName ?? "No file recorded"}
          {project.rowCount !== null && (
            <span>· {project.rowCount.toLocaleString()} rows</span>
          )}
        </p>
        {data && (
          <DeviceData
            kept={kept}
            replacing={attach.isPending}
            onReplace={(file) => attach.mutate(file)}
            onRemove={() => void device.remove()}
          />
        )}
      </div>

      {problem && (
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}

      {!data && opening ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : !data ? (
        <AttachPanel
          project={project}
          busyName={attach.isPending ? attach.variables?.name : null}
          error={attach.error?.message}
          onFile={(file) => attach.mutate(file)}
        />
      ) : (
        <>
        {data.profile.sample && <SampleNotice sample={data.profile.sample} />}
        <Tabs defaultValue="dashboard">
          <TabsList className="h-10 rounded-full p-1">
            <TabsTrigger value="dashboard" className="rounded-full px-4">Dashboard</TabsTrigger>
            <TabsTrigger value="insights" className="rounded-full px-4">Insights</TabsTrigger>
            <TabsTrigger value="story" className="rounded-full px-4">Story</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="flex flex-col gap-6 pt-4">
            <AiPanel
              profile={data.profile}
              spec={project.spec}
              onSpec={(spec) => actions.saveSpec.mutate({ id, spec })}
            />
            <div className="flex flex-wrap items-center gap-3">
              <AddChartMenu
                profile={data.profile}
                spec={project.spec}
                onSpec={(spec) => actions.saveSpec.mutate({ id, spec })}
              />
              <PlacesMenu
                profile={data.profile}
                spec={project.spec}
                onSpec={(spec) => actions.saveSpec.mutate({ id, spec })}
              />
            </div>
            <Dashboard
              spec={project.spec}
              source={liveSource}
              dataKey={data.loadId}
              showTitle={false}
              onSpec={(spec) => actions.saveSpec.mutate({ id, spec })}
            />
          </TabsContent>
          <TabsContent value="insights" className="pt-4">
            <InsightsPanel profile={data.profile} dataKey={data.loadId} />
          </TabsContent>
          <TabsContent value="story" className="pt-4">
            <StoryPanel profile={data.profile} dataKey={data.loadId} />
          </TabsContent>
        </Tabs>
        </>
      )}

      <PublishedLinks
        shares={project.shares}
        onRevoke={(slug) => actions.revokeLink.mutate({ projectId: id, slug })}
      />
    </div>
  );
}

function TitleEditor({
  title,
  onSave,
}: {
  title: string;
  onSave: (title: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState(title);
  async function commit() {
    const next = value.trim();
    if (!next) return setValue(title);
    if (next !== title) await onSave(next).catch(() => setValue(title));
  }
  return (
    <Input
      aria-label="Project name"
      value={value}
      maxLength={120}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="h-auto min-w-0 flex-1 border-transparent bg-transparent px-1 text-3xl font-semibold tracking-tight shadow-none md:text-3xl hover:border-input focus-visible:border-ring sm:max-w-xl"
    />
  );
}

function DeviceData({
  kept,
  replacing,
  onReplace,
  onRemove,
}: {
  kept: boolean;
  replacing: boolean;
  onReplace: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"
      data-testid="device-data"
    >
      <span className="inline-flex items-center gap-1.5">
        <HardDrive className="size-4" />
        {kept
          ? "Kept on this device only"
          : localDataSupported()
            ? "Not kept on this device"
            : "This browser cannot keep a copy, so you will choose the file again next time"}
      </span>
      <label className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline">
        {replacing ? "Reading…" : "Replace file"}
        <input
          type="file"
          hidden
          accept=".xlsx,.csv,.tsv,.json,.ndjson,.jsonl"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onReplace(file);
          }}
        />
      </label>
      {kept && (
        <button
          type="button"
          onClick={onRemove}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Remove from this device
        </button>
      )}
    </div>
  );
}

function AttachPanel({
  project,
  busyName,
  error,
  onFile,
}: {
  project: ProjectDetail;
  busyName?: string | null;
  error?: string;
  onFile: (file: File) => void;
}) {
  return (
    <EmptyTile tone="yellow" title="Attach your file to open this dashboard">
      <p>
        Your rows are never stored on our servers, so choose {project.sourceName ? <strong>{project.sourceName}</strong> : "the file"} again to see the
        charts. A newer version with the same columns works too.
      </p>
      <div className="mt-5 flex flex-col gap-4 text-foreground">
        <div className="rounded-2xl bg-card p-2">
          <DropZone onFile={onFile} busyName={busyName} error={error} title="Drop the file here, or click to browse" />
        </div>
        {project.spec.charts.length > 0 && (
          <p className="text-sm opacity-80">
            This dashboard has {project.spec.charts.length} charts: {project.spec.charts.slice(0, 4).map((c) => c.title).join(", ")}
            {project.spec.charts.length > 4 ? "…" : ""}
          </p>
        )}
      </div>
    </EmptyTile>
  );
}

function PublishedLinks({
  shares,
  onRevoke,
}: {
  shares: ProjectDetail["shares"];
  onRevoke: (slug: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!shares.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Published links</CardTitle>
        <CardDescription>
          Read-only snapshots. Turning one off makes the link stop working
          straight away.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {shares.map((s) => {
          const url = `${typeof location === "undefined" ? "" : location.origin}/s/${s.slug}`;
          return (
            <div
              key={s.slug}
              className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
              data-testid="published-link"
            >
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm underline-offset-4 hover:underline"
              >
                {url}
              </a>
              {s.passwordProtected && (
                <span className="text-xs text-muted-foreground">
                  Password protected
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(s.slug);
                  setTimeout(() => setCopied(null), 1500);
                }}
              >
                {copied === s.slug ? <Check /> : <Copy />}
                {copied === s.slug ? "Copied" : "Copy"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRevoke(s.slug)}
              >
                <Link2Off /> Turn off
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
