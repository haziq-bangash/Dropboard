"use client";

import {
  Copy,
  FileSpreadsheet,
  Globe,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Grain } from "@/components/art/Grain";
import { bentoTile, Chip, ItalicLast, Stat, TONES } from "@/components/marketing/bento";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useProjectMutations } from "@/lib/queries";
import type { ProjectSummary } from "@/lib/projects";

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function ProjectCard({
  project,
  onError,
  tone = "yellow",
}: {
  project: ProjectSummary;
  onError: (message: string) => void;
  /** The tile's colour: the list takes them in turn, as the homepage's tiles do. */
  tone?: keyof typeof TONES;
}) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const actions = useProjectMutations(session?.user.id);
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [title, setTitle] = useState(project.title);
  const busy = actions.rename.isPending || actions.remove.isPending;
  const fail = (e: Error) => {
    onError(e.message);
    setDialog(null);
  };

  return (
    <>
      <div className={`${bentoTile} ${TONES[tone]} min-h-[240px] justify-between gap-6 p-6`} data-testid="project-card">
        {tone === "teal" && <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center opacity-20" style={{ backgroundImage: "url(/art/topo-lines-light.svg)" }} />}
        <Grain className="-z-10 opacity-40" />
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-sm opacity-85">
              <FileSpreadsheet className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{project.sourceName ?? "No file recorded"}</span>
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="relative z-10 -mr-2 -mt-1 rounded-full hover:bg-black/10 hover:text-current aria-expanded:bg-black/10"
                    aria-label={`Actions for ${project.title}`}
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => router.push(`/app/p/${project.id}`)}
                >
                  Open
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDialog("rename")}>
                  <Pencil />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    actions.duplicate.mutate(project.id, { onError: fail })
                  }
                >
                  <Copy />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDialog("delete")}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Link href={`/app/p/${project.id}`} className="after:absolute after:inset-0">
            <h3 className="line-clamp-2 font-serif text-3xl leading-[1.05] font-normal tracking-normal text-balance">
              <ItalicLast text={project.title} />
            </h3>
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <Stat>
            <span className="text-5xl">
              <span>{(project.rowCount ?? project.charts).toLocaleString()}</span>
              <span className="font-sans text-base font-normal tracking-normal"> {project.rowCount !== null ? "rows" : "charts"}</span>
            </span>
          </Stat>
          <div className="flex flex-wrap items-center gap-2">
            {project.rowCount !== null && (
              <Chip tilt="-rotate-2" className="bg-white/85 text-foreground">
                {project.charts} charts
              </Chip>
            )}
            {project.published && (
              <Chip tilt="rotate-2" className="inline-flex items-center gap-1 bg-white/85 text-foreground">
                <Globe className="size-3" aria-hidden="true" />
                Published
              </Chip>
            )}
            <span className="ml-auto text-xs opacity-85">Updated {when(project.updatedAt)}</span>
          </div>
        </div>
      </div>

      <Dialog
        open={dialog === "rename"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              The name appears on your projects list and as the dashboard title.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim())
                actions.rename.mutate(
                  { id: project.id, title: title.trim() },
                  { onSuccess: () => setDialog(null), onError: fail },
                );
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={`rename-${project.id}`}>Name</Label>
              <Input
                id={`rename-${project.id}`}
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || !title.trim()}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>
              “{project.title}” and its published links are removed for good.
              Your original file is not touched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                actions.remove.mutate(project.id, {
                  onSuccess: () => setDialog(null),
                  onError: fail,
                })
              }
            >
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
