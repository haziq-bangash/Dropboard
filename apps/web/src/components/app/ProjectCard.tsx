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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
}: {
  project: ProjectSummary;
  onError: (message: string) => void;
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
      <Card
        className="group relative transition-shadow hover:shadow-md"
        data-testid="project-card"
      >
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/app/p/${project.id}`}
              className="min-w-0 flex-1 after:absolute after:inset-0"
            >
              <h3 className="truncate text-lg font-semibold tracking-tight">
                {project.title}
              </h3>
              <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                <FileSpreadsheet className="size-3.5 shrink-0" />
                <span className="truncate">
                  {project.sourceName ?? "No file recorded"}
                </span>
              </p>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="relative z-10"
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
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {project.rowCount !== null && (
              <Badge variant="secondary">
                {project.rowCount.toLocaleString()} rows
              </Badge>
            )}
            <Badge variant="secondary">{project.charts} charts</Badge>
            {project.published && (
              <Badge variant="secondary" className="gap-1">
                <Globe className="size-3" />
                Published
              </Badge>
            )}
            <span className="ml-auto">Updated {when(project.updatedAt)}</span>
          </div>
        </CardContent>
      </Card>

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
