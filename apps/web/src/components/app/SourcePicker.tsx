"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowRight, ClipboardPaste, Link2, Loader2, ServerCog } from "lucide-react";
import { useRef, useState } from "react";
import { DropZone } from "@/components/app/DropZone";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchLink } from "@/lib/import-sources";
import { PasteError, pastedFile } from "@/lib/paste";
import type { useStartProject } from "@/lib/start-project";

/**
 * The ways to start a project: drop a file, paste cells or a table, or give a link (a Google Sheet, or a CSV or JSON address).
 * A file and pasted data are read in the browser and never uploaded. A link is fetched by our server and handed straight to the
 * browser, which is why the Link tab says so.
 */
export function SourcePicker({ start }: { start: ReturnType<typeof useStartProject> }) {
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  // the clipboard's HTML flavour of the last paste, kept so a web table keeps its cells; used only while the box still holds that paste
  const html = useRef<{ plain: string; html: string } | null>(null);
  const [address, setAddress] = useState("");

  const link = useMutation({
    mutationFn: async (url: string) => ({ file: await fetchLink(url), url: url.trim() }),
    onSuccess: ({ file, url }) => start.mutate({ file, sourceUrl: url }),
  });
  const busy = start.isPending || link.isPending;

  function buildFromPaste() {
    setPasteError(null);
    try {
      const keep = html.current && html.current.plain === pasted ? html.current.html : null;
      start.mutate({ file: pastedFile(pasted, keep) });
    } catch (e) {
      setPasteError(e instanceof PasteError ? e.message : "That could not be read.");
    }
  }

  return (
    <Tabs defaultValue="file">
      <TabsList className="h-10 rounded-full p-1">
        <TabsTrigger value="file" className="rounded-full px-4">
          File
        </TabsTrigger>
        <TabsTrigger value="paste" className="rounded-full px-4">
          Paste
        </TabsTrigger>
        <TabsTrigger value="link" className="rounded-full px-4">
          Link
        </TabsTrigger>
      </TabsList>

      <TabsContent value="file" className="pt-4">
        <DropZone onFile={(file) => start.mutate({ file })} busyName={start.isPending ? start.variables?.file.name : null} error={start.error?.message} />
      </TabsContent>

      <TabsContent value="paste" className="pt-4">
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-dashed bg-muted/30 p-5">
          <label htmlFor="pasted-data" className="flex items-center gap-2 text-lg font-medium">
            <ClipboardPaste className="size-5" aria-hidden="true" /> Paste cells or a table
          </label>
          <p className="text-sm text-muted-foreground">Copy cells from Excel or Google Sheets, or a table from a web page, headers included, and paste them here.</p>
          <textarea
            id="pasted-data"
            value={pasted}
            rows={9}
            spellCheck={false}
            placeholder={"region\trevenue\nNorth\t120\nSouth\t98"}
            className="w-full rounded-xl border bg-card p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(e) => {
              setPasted(e.target.value);
              setPasteError(null);
            }}
            onPaste={(e) => {
              const plain = e.clipboardData.getData("text/plain");
              const markup = e.clipboardData.getData("text/html");
              html.current = markup ? { plain, html: markup } : null;
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button className="rounded-full" disabled={busy || !pasted.trim()} onClick={buildFromPaste}>
              {start.isPending ? <Loader2 className="animate-spin" /> : null}
              {start.isPending ? "Reading…" : "Build dashboard"}
              {!start.isPending && <ArrowRight />}
            </Button>
            <span className="text-sm text-muted-foreground">Read in your browser. Your rows are never uploaded.</span>
          </div>
          {(pasteError || start.error) && (
            <Alert variant="destructive">
              <AlertDescription>{pasteError ?? start.error?.message}</AlertDescription>
            </Alert>
          )}
        </div>
      </TabsContent>

      <TabsContent value="link" className="pt-4">
        <form
          className="flex flex-col gap-3 rounded-2xl border-2 border-dashed bg-muted/30 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (address.trim()) link.mutate(address);
          }}
        >
          <label htmlFor="source-link" className="flex items-center gap-2 text-lg font-medium">
            <Link2 className="size-5" aria-hidden="true" /> Start from a link
          </label>
          <p className="text-sm text-muted-foreground">
            A Google Sheet shared with &ldquo;Anyone with the link&rdquo; (or published to the web), or a link straight to a CSV or JSON file.
          </p>
          <div className="flex flex-wrap gap-3">
            <Input
              id="source-link"
              type="url"
              value={address}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              className="h-11 min-w-0 flex-1 rounded-xl bg-card"
              onChange={(e) => {
                setAddress(e.target.value);
                link.reset();
              }}
            />
            <Button type="submit" className="h-11 rounded-full px-5" disabled={busy || !address.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {link.isPending ? "Fetching…" : start.isPending ? "Reading…" : "Fetch and build"}
              {!busy && <ArrowRight />}
            </Button>
          </div>
          <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="link-note">
            <ServerCog className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Unlike a file, a link is fetched by Dropboard&apos;s server and passed straight to your browser. It is not stored, but it does pass through. The link
              is saved with the project, so the data can be refreshed. Do not use a link that has a password or key in it.
            </span>
          </p>
          {(link.error || start.error) && (
            <Alert variant="destructive">
              <AlertDescription>{link.error?.message ?? start.error?.message}</AlertDescription>
            </Alert>
          )}
        </form>
      </TabsContent>
    </Tabs>
  );
}
