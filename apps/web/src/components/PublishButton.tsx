"use client";

import { publishableSpec } from "@dropboard/engine";
import type { DashboardSpec } from "@dropboard/spec";
import { Check, Copy, Eye, EyeOff, Globe, Share2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth-client";
import { useProjectList } from "@/lib/queries";
import { collectResults } from "@/lib/results";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new Error(msg ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function PublishButton({ spec, projectId, onPublished }: { spec: DashboardSpec; projectId?: string; onPublished?: () => void }) {
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [protect, setProtect] = useState(false);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expires, setExpires] = useState("never");
  // an expiry date is one of the paid plans' link controls
  const controls = useProjectList(Boolean(session)).data?.limits.linkControls === true;

  if (!session) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link href="/login" target="_blank" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>{" "}
        to publish a shareable link. Your dashboard stays here while you sign in.
      </p>
    );
  }

  const invalidPassword = protect && password.length < 4;

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const pub = publishableSpec(spec);
      const results = await collectResults(pub);
      // a saved project already exists; the quick try-it flow saves one on the way
      const id = projectId ?? (await post<{ id: string }>("/api/projects", { spec: pub })).id;
      const { slug } = await post<{ slug: string }>(`/api/projects/${id}/share`, {
        results,
        password: protect ? password : undefined,
        expiresInDays: controls && expires !== "never" ? Number(expires) : undefined,
      });
      setLink(`${location.origin}/s/${slug}`);
      onPublished?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          setLink(null);
          setError(null);
          setOpen(true);
        }}
      >
        <Share2 /> Publish
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish dashboard</DialogTitle>
            <DialogDescription>
              Creates a read-only link with your charts and summaries. Your rows are never shared.
            </DialogDescription>
          </DialogHeader>

          {link ? (
            <div className="flex flex-col gap-3">
              <Label htmlFor="share-link">Your link</Label>
              <div className="flex gap-2">
                <Input id="share-link" data-testid="share-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <a href={link} target="_blank" className="text-sm text-muted-foreground underline underline-offset-4">
                Open in a new tab
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="flex items-start gap-3">
                  <Globe className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Search engine indexing</p>
                    <p className="text-sm text-muted-foreground">Published links are never indexed.</p>
                  </div>
                </div>
                <Switch checked={false} disabled aria-label="Search engine indexing" />
              </div>

              <div className="flex flex-col gap-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="protect" className="text-sm font-medium">
                    Password protection
                  </Label>
                  <Switch id="protect" checked={protect} onCheckedChange={setProtect} aria-label="Password protection" />
                </div>
                {protect && (
                  <div className="relative">
                    <Input
                      type={reveal ? "text" : "password"}
                      placeholder="At least 4 characters"
                      aria-label="Link password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      aria-label={reveal ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
                      onClick={() => setReveal(!reveal)}
                    >
                      {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="expiry" className="text-sm font-medium">
                    Link expires
                  </Label>
                  <select
                    id="expiry"
                    value={controls ? expires : "never"}
                    disabled={!controls}
                    onChange={(e) => setExpires(e.target.value)}
                    className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-60"
                  >
                    <option value="never">Never</option>
                    <option value="7">In 7 days</option>
                    <option value="30">In 30 days</option>
                    <option value="90">In 90 days</option>
                  </select>
                </div>
                {!controls && (
                  <p className="text-sm text-muted-foreground" data-testid="expiry-locked">
                    Expiry dates are part of Pro.{" "}
                    <Link href="/pricing" target="_blank" className="underline underline-offset-4">
                      See the plans
                    </Link>
                  </p>
                )}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            {link ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={publish} disabled={busy || invalidPassword}>
                  {busy ? "Publishing…" : "Create link"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
