"use client";

import { FileSpreadsheet, Loader2, ShieldCheck, Upload } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** A file drop target for the app pages. The file is read in the browser by the caller. */
export function DropZone({
  onFile,
  busyName,
  error,
  title = "Drop a spreadsheet here, or click to browse",
}: {
  onFile: (file: File) => void;
  /** Set while a file is being read. */
  busyName?: string | null;
  error?: string | null;
  title?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <div>
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-muted/30 px-6 py-14 text-center transition-colors hover:border-brand hover:bg-muted/50",
          over && "border-brand bg-muted/60",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
      >
        <input
          type="file"
          hidden
          accept=".xlsx,.csv,.tsv,.json,.ndjson,.jsonl"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <div className="flex size-12 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
          {busyName ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
        </div>
        <p className="text-lg font-medium">{busyName ? `Reading ${busyName}…` : title}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {[".xlsx", ".csv", ".json", ".ndjson"].map((t) => (
            <Badge key={t} variant="secondary" className="gap-1">
              <FileSpreadsheet className="size-3" />
              {t}
            </Badge>
          ))}
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck className="size-4" />
          Read in your browser. Your rows are never uploaded.
        </p>
      </label>
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
