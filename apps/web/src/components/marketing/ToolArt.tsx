import { ArrowUp, Copy, Lock, ShieldCheck } from "lucide-react";
import { Grain } from "@/components/art/Grain";
import { cn } from "@/lib/utils";

// Small illustrations for the feature cards. Static markup in the brand palette; the cards are `group`s,
// so hover states here respond to hovering the whole card. Sample text only, not real data.

function Frame({ className, lines, children }: { className?: string; lines?: "dark" | "light"; children: React.ReactNode }) {
  return (
    <div data-testid="tool-art" className={cn("relative isolate h-32 overflow-hidden rounded-lg", className)}>
      {lines && (
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-cover bg-center opacity-25"
          style={{ backgroundImage: `url(/art/topo-lines-${lines}.svg)` }}
        />
      )}
      <Grain className="-z-10 opacity-40" />
      <div className="flex h-full items-center justify-center">{children}</div>
    </div>
  );
}

const BARS = [40, 65, 50, 85, 60, 95, 72];

export function DashboardArt() {
  return (
    <Frame className="bg-secondary">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-30 [background-image:radial-gradient(circle,#233038_1px,transparent_1.4px)] [background-size:14px_14px]"
      />
      <div className="w-[78%] rounded-lg bg-card p-2.5 shadow-md">
        <div className="flex h-[68px] items-end gap-1.5">
          {BARS.map((h, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 origin-bottom rounded-t transition-transform duration-500 group-hover:scale-y-[1.14]",
                i === 5 ? "bg-brand" : "bg-primary",
              )}
              style={{ height: `${h}%`, transitionDelay: `${i * 30}ms` }}
            />
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function PilotArt() {
  return (
    <Frame className="bg-primary" lines="light">
      <div className="flex w-[88%] items-center gap-2 rounded-full bg-background py-2 pl-4 pr-2 shadow-lg">
        <span className="truncate text-xs font-medium text-primary">Which region grew fastest?</span>
        <span className="h-4 w-px shrink-0 animate-pulse bg-primary" />
        <span className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-transform duration-300 group-hover:scale-110">
          <ArrowUp className="size-3.5" />
        </span>
      </div>
    </Frame>
  );
}

export function AskArt() {
  return (
    <Frame className="bg-[#D3DBDD]">
      <div className="flex w-[86%] flex-col gap-2">
        <div className="ml-auto rounded-2xl rounded-br-sm bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-transform duration-300 group-hover:-translate-x-1">
          Top 10 products?
        </div>
        <div className="w-[78%] rounded-2xl rounded-bl-sm bg-card p-2.5 shadow-sm transition-transform duration-300 group-hover:translate-x-1">
          <div className="flex flex-col gap-1.5">
            {[100, 72, 48].map((w) => (
              <div key={w} className="flex items-center gap-2">
                <div className="h-1.5 w-8 rounded bg-muted-foreground/30" />
                <div className="h-1.5 rounded bg-primary/70" style={{ width: `${w * 0.55}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function ShareArt() {
  return (
    <Frame className="bg-gradient-to-br from-[#FFB05A] to-[#FF5B04]">
      <div className="flex w-[88%] flex-col gap-2">
        <div className="flex items-center gap-2 rounded-full bg-background py-1.5 pl-3 pr-1.5 shadow-lg">
          <Lock className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs text-foreground">dropboard.app/s/k3J9x2Qa</span>
          <span className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <Copy className="size-3" />
          </span>
        </div>
        <div className="flex gap-1.5 transition-transform duration-300 group-hover:translate-x-1">
          {["Password", "Read-only"].map((t) => (
            <span key={t} className="rounded-full bg-foreground/75 px-2 py-0.5 text-[10px] font-medium text-background">
              {t}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function PrivateArt() {
  return (
    <Frame className="bg-foreground" lines="light">
      {[88, 64, 40].map((size, i) => (
        <span
          key={size}
          className="absolute rounded-full border border-background/25 transition-transform duration-500 group-hover:scale-110"
          style={{ width: size * 1.6, height: size * 1.6, transitionDelay: `${i * 60}ms` }}
        />
      ))}
      <span className="relative flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-lg">
        <ShieldCheck className="size-6" />
      </span>
    </Frame>
  );
}

export function FastArt() {
  return (
    <Frame className="bg-muted">
      <div className="flex w-[84%] flex-col gap-2.5">
        <span className="w-fit rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-foreground">1.4M rows</span>
        {[100, 74, 90].map((w, i) => (
          <div
            key={i}
            className="h-3 rounded-sm transition-transform duration-500 group-hover:translate-x-1.5"
            style={{
              width: `${w}%`,
              backgroundImage: "repeating-linear-gradient(90deg, #233038 0 9px, transparent 9px 13px)",
              transitionDelay: `${i * 70}ms`,
            }}
          />
        ))}
      </div>
    </Frame>
  );
}
