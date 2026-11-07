import { ShieldCheck } from "lucide-react";
import { Grain } from "@/components/art/Grain";

/** The decorative right-hand panel of the sign-in card: contour terrain, grain and two glass cards. */
export function AuthArt() {
  return (
    <div className="relative isolate hidden min-h-[600px] overflow-hidden md:block">
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: "url(/art/topo-orange.svg)" }} />
      <Grain className="-z-10 opacity-40" />

      <div className="absolute right-5 top-5 flex items-center gap-2 rounded-full bg-foreground/70 py-2 pl-3 pr-4 text-[13px] font-medium tracking-wide text-background backdrop-blur-md">
        <ShieldCheck className="size-4" />
        Your rows never leave your browser
      </div>

      <div className="absolute inset-x-5 bottom-5 rounded-2xl bg-foreground/70 p-7 text-background backdrop-blur-md">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-secondary uppercase">Private by design</p>
        <p className="mt-3 font-serif text-[2.6rem] leading-[1.05] tracking-normal text-balance">
          Drop a file. Get a <em className="text-secondary italic">dashboard</em>. Nothing gets uploaded.
        </p>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-background/75">
          Your spreadsheet is read in your browser. Only the charts you choose to publish ever leave it.
        </p>
      </div>
    </div>
  );
}
