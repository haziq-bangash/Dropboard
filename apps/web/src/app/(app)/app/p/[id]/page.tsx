"use client";

import type { DashboardSpec } from "@dropboard/spec";
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
import { useCallback, useEffect, useState } from "react";
import { AiPanel } from "@/components/AiPanel";
import { Dashboard } from "@/components/Dashboard";
import { PublishButton } from "@/components/PublishButton";
import { DropZone } from "@/components/app/DropZone";
import { useProjects } from "@/components/app/projects-store";
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
import {
  hasProjectData,
  loadProjectData,
  localDataSupported,
  removeProjectData,
  saveProjectData,
} from "@/lib/local-data";
import {
  getLoaded,
  missingColumns,
  setLoaded,
  type LoadedData,
} from "@/lib/loaded-data";
import { ApiError, projectsApi, type ProjectDetail } from "@/lib/projects";
import { liveSource } from "@/lib/results";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { refresh } = useProjects();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [data, setData] = useState<LoadedData | null>(() =>
    getLoaded()?.projectId === id ? getLoaded() : null,
  );
  const [error, setError] = useState<string | null>(null);
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  // true while we look for a copy of the rows kept on this device
  const [opening, setOpening] = useState(() => getLoaded()?.projectId !== id);
  // whether a copy of the rows is kept on this device
  const [kept, setKept] = useState(false);

  const load = useCallback(async () => {
    try {
      setProject(await projectsApi.get(id));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else
        setError(
          e instanceof Error ? e.message : "Could not open this project.",
        );
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (data || !userId || !project) return;
    let cancelled = false;
    void loadProjectData(userId, id, project.sourceName ?? "saved file").then(
      (loaded) => {
        if (cancelled) return;
        if (loaded) {
          setLoaded(loaded);
          setData(loaded);
          setKept(true);
        }
        setOpening(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [data, userId, project, id]);

  // rows that were just loaded (a new project) are copied to this device once
  useEffect(() => {
    if (data && userId && !kept && localDataSupported()) {
      void hasProjectData(userId, id).then((has) => (has ? setKept(true) : saveProjectData(userId, id).then(setKept)));
    }
  }, [data, userId, id, kept]);

  async function saveSpec(spec: DashboardSpec) {
    setProject((p) => (p ? { ...p, spec, title: spec.title } : p));
    try {
      await projectsApi.saveSpec(id, spec);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your changes.");
    }
  }

  if (missing) {
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
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <Skeleton className="h-64 w-full rounded-xl" />
        )}
      </div>
    );
  }

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
          <TitleEditor
            title={project.title}
            onSave={async (title) => {
              await projectsApi.rename(id, title);
              setProject({
                ...project,
                title,
                spec: { ...project.spec, title },
              });
              void refresh();
            }}
          />
          {data && (
            <PublishButton
              spec={project.spec}
              projectId={id}
              onPublished={() => void load().then(refresh)}
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
        {data && userId && (
          <DeviceData
            project={project}
            kept={kept}
            onReplaced={(d) => {
              setData(d);
              setKept(true);
              setError(null);
            }}
            onRemoved={async () => {
              await removeProjectData(userId, id);
              setLoaded(null);
              setData(null);
              setKept(false);
            }}
            userId={userId}
            onError={setError}
          />
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!data && opening ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : !data ? (
        <AttachPanel
          project={project}
          onAttached={(d) => {
            setData(d);
            setKept(false);
            setError(null);
          }}
        />
      ) : (
        <>
          <AiPanel
            profile={data.profile}
            spec={project.spec}
            onSpec={saveSpec}
          />
          <Dashboard
            spec={project.spec}
            source={liveSource}
            showTitle={false}
          />
        </>
      )}

      <PublishedLinks
        shares={project.shares}
        onRevoke={async (slug) => {
          await projectsApi.revokeLink(slug);
          await load();
          void refresh();
        }}
      />
    </div>
  );
}

function TitleEditor({
  title,
  onSave,
}: {
  title: string;
  onSave: (title: string) => Promise<void>;
}) {
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
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
      className="h-auto min-w-0 flex-1 border-transparent bg-transparent px-1 text-2xl font-semibold tracking-tight shadow-none hover:border-input focus-visible:border-ring sm:max-w-xl"
    />
  );
}

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
  const loaded = { projectId: project.id, fileName: file.name, profile };
  setLoaded(loaded);
  return loaded;
}

function DeviceData({
  project,
  userId,
  kept,
  onReplaced,
  onRemoved,
  onError,
}: {
  project: ProjectDetail;
  userId: string;
  kept: boolean;
  onReplaced: (d: LoadedData) => void;
  onRemoved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
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
        {busy ? "Reading…" : "Replace file"}
        <input
          type="file"
          hidden
          accept=".xlsx,.csv,.tsv,.json,.ndjson,.jsonl"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            try {
              const loaded = await readForProject(project, file);
              await saveProjectData(userId, project.id);
              onReplaced(loaded);
            } catch (err) {
              onError(
                err instanceof Error
                  ? err.message
                  : "Could not read that file.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {kept && (
        <button
          type="button"
          onClick={() => void onRemoved()}
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
  onAttached,
}: {
  project: ProjectDetail;
  onAttached: (d: LoadedData) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function attach(file: File) {
    setBusy(file.name);
    setError(null);
    try {
      onAttached(await readForProject(project, file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attach your file to open this dashboard</CardTitle>
        <CardDescription>
          Your rows are never stored on our servers, so choose{" "}
          {project.sourceName ? (
            <strong>{project.sourceName}</strong>
          ) : (
            "the file"
          )}{" "}
          again to see the charts. A newer version with the same columns works
          too.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DropZone
          onFile={attach}
          busyName={busy}
          error={error}
          title="Drop the file here, or click to browse"
        />
        {project.spec.charts.length > 0 && (
          <p className="text-sm text-muted-foreground">
            This dashboard has {project.spec.charts.length} charts:{" "}
            {project.spec.charts
              .slice(0, 4)
              .map((c) => c.title)
              .join(", ")}
            {project.spec.charts.length > 4 ? "…" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PublishedLinks({
  shares,
  onRevoke,
}: {
  shares: ProjectDetail["shares"];
  onRevoke: (slug: string) => Promise<void>;
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
