"use client";

import { STARTERS } from "@dropboard/engine";
import { Loader2 } from "lucide-react";
import { Grain } from "@/components/art/Grain";
import { bentoBase, Chip, ItalicLast, Stat } from "@/components/marketing/bento";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { starterFile, useStartProject } from "@/lib/start-project";

/**
 * The look of each tile, in order: the same palette as the homepage's "Why Dropboard" section. `layout` is how many columns and
 * rows it takes from a small screen up (the first is tall, two sit beside it, two run the full width), and `chips` whether it has room for the pills that say what the sample shows (above the text on a phone, floating at the corner from a small screen up).
 */
const TILES = [
  { tone: "bg-primary text-primary-foreground", topo: "opacity-20", layout: "sm:row-span-2", chips: true, big: true, chipTone: ["bg-secondary text-secondary-foreground", "bg-background text-foreground", "bg-brand text-[#1b262c]"] },
  { tone: "bg-secondary text-secondary-foreground", topo: "", layout: "", chips: false, big: false, chipTone: [] },
  { tone: "bg-[#D3DBDD] text-foreground", topo: "", layout: "", chips: false, big: false, chipTone: [] },
  { tone: "bg-gradient-to-br from-[#FFD59A] to-[#FF9A45] text-foreground", topo: "", layout: "sm:col-span-2", chips: true, big: false, chipTone: ["border border-dashed border-foreground/60 bg-background/70", "border border-dashed border-foreground/60 bg-background/70", "border border-dashed border-foreground/60 bg-background/70"] },
  { tone: "bg-foreground text-background", topo: "opacity-[0.16]", layout: "sm:col-span-2", chips: true, big: true, chipTone: ["bg-secondary text-secondary-foreground", "bg-background text-foreground", "bg-brand text-[#1b262c]"] },
] as const;

const TILTS = ["-rotate-3", "rotate-2", "-rotate-1"];

/** Sample datasets that open as real projects, for anyone without a file at hand. The numbers are made up. */
export function StarterGrid() {
  const start = useStartProject();
  const opening = start.isPending ? start.variables?.file.name : null;

  return (
    <section aria-labelledby="starters-heading">
      <h2 id="starters-heading" className="text-lg font-semibold tracking-tight">
        No file at hand? Start from a sample
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Each one opens as a real project you can edit and publish. The data is made up.</p>
      {start.error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{start.error.message}</AlertDescription>
        </Alert>
      )}
      <div className="mt-5 grid gap-4 sm:auto-rows-[220px] sm:grid-cols-2">
        {STARTERS.map((s, i) => {
          const tile = TILES[i % TILES.length];
          const busy = opening === s.fileName;
          const shows = s.shows.split(", ").slice(0, 3);
          return (
            <button
              key={s.id}
              type="button"
              disabled={start.isPending}
              onClick={() => start.mutate({ file: starterFile(s), title: s.title })}
              className={`${bentoBase} ${tile.tone} ${tile.layout} text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:opacity-60`}
              data-testid="starter"
            >
              {tile.topo && <div aria-hidden="true" className={`absolute inset-0 -z-10 bg-cover bg-center ${tile.topo}`} style={{ backgroundImage: "url(/art/topo-lines-light.svg)" }} />}
              <Grain className="-z-10 opacity-40" />

              {tile.chips && (
                <span className="mb-4 flex flex-wrap gap-2 sm:absolute sm:right-5 sm:top-5 sm:mb-0 sm:max-w-[70%] sm:justify-end">
                  {shows.map((label, k) => (
                    <Chip key={label} tilt={TILTS[k % TILTS.length]} className={tile.chipTone[k % tile.chipTone.length]}>
                      {label}
                    </Chip>
                  ))}
                </span>
              )}

              <span className="text-sm font-medium tracking-wide opacity-75">{s.rows.toLocaleString()} rows</span>
              {tile.big ? (
                <Stat>
                  <span className="mt-1 block text-5xl sm:text-6xl">
                    <ItalicLast text={s.title} />
                  </span>
                </Stat>
              ) : (
                <span className="mt-1 block text-xl font-semibold leading-tight tracking-tight">{s.title}</span>
              )}
              <span className="mt-2 block max-w-md text-sm opacity-80">{s.description}</span>
              {busy && (
                <span className="absolute bottom-5 right-5 inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1 text-sm font-medium text-foreground shadow-sm">
                  <Loader2 className="size-4 animate-spin" /> Opening
                </span>
              )}
              {!tile.chips && (
                <span className="mt-3 block text-xs opacity-70">{s.shows}</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
