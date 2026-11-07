import { BarChart3, ShieldCheck } from "lucide-react";
import { Grain } from "@/components/art/Grain";

/** The decorative right-hand panel of the sign-in card: contour terrain, grain and two glass cards. */
export function AuthArt() {
  return (
    <div className="relative isolate hidden min-h-[600px] overflow-hidden md:block">
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: "url(/art/topo-orange.svg)" }} />
      <Grain className="-z-10 opacity-40" />

      <div className="absolute right-5 top-5 flex items-center gap-2 rounded-2xl bg-foreground/60 px-4 py-3 text-sm text-background backdrop-blur-md">
        <ShieldCheck className="size-4" />
        Your rows never leave your browser
      </div>

      <div className="absolute inset-x-5 bottom-5 rounded-2xl bg-foreground/60 p-5 text-background backdrop-blur-md">
        <p className="text-lg leading-snug font-medium">Drop a file. Get a dashboard. Nothing gets uploaded.</p>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <BarChart3 className="size-4" />
          </span>
          <div className="text-sm">
            <p className="font-medium">Dropboard</p>
            <p className="opacity-70">Private by design</p>
          </div>
        </div>
      </div>
    </div>
  );
}
