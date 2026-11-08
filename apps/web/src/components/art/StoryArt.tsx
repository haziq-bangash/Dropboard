import { cn } from "@/lib/utils";

/**
 * Decorative shapes for the Story page, in the spirit of an editorial collage: contour lines, a halftone patch, an oval, striped
 * bars, a dark dot and a mint line that wanders through them. All of it is hidden from assistive technology, and none of it
 * moves, so it needs no motion setting.
 */

const MINT = "#A8E6C9";

/** The cluster of shapes beside the headline, with the mint line crossing it. */
export function StoryCollage({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none relative h-64 w-full select-none sm:h-96", className)}>
      {/* contour lines */}
      <div className="absolute left-0 top-0 h-[48%] w-[50%] bg-cover bg-center opacity-50" style={{ backgroundImage: "url(/art/topo-lines-dark.svg)" }} />
      {/* a halftone patch: a field of dots fading into blue */}
      <div
        className="absolute left-[38%] top-[12%] h-[62%] w-[40%]"
        style={{
          backgroundColor: "#CFE8E1",
          backgroundImage: "radial-gradient(circle, rgba(7,80,86,0.55) 1.3px, transparent 1.8px), radial-gradient(80% 100% at 100% 25%, #4A6FA5 0%, transparent 62%)",
          backgroundSize: "7px 7px, 100% 100%",
        }}
      />
      {/* a dark dot */}
      <div className="absolute right-0 top-[6%] size-12 rounded-full bg-foreground sm:size-16" />
      {/* an oval of warm light */}
      <div className="absolute bottom-0 right-[3%] h-[54%] w-[26%] rounded-[999px] bg-gradient-to-b from-[#F7DDBB] via-[#FFB05A] to-[#FF7A2E]" />
      {/* striped bars */}
      <div className="absolute bottom-[6%] left-[38%] h-[15%] w-[28%]" style={{ backgroundImage: "repeating-linear-gradient(0deg, #233038 0 5px, transparent 5px 11px)" }} />
      {/* the mint line, thick and uneven, crossing everything */}
      <svg viewBox="0 0 400 300" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path d="M0 215 C 55 125, 105 265, 165 205 S 255 95, 315 165 S 375 125, 400 100" fill="none" stroke={MINT} strokeWidth="9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/** A mint line running down the side of the page, behind the text, joining the chapters. */
export function MintThread({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 60 1000" preserveAspectRatio="none" className={cn("pointer-events-none absolute select-none", className)}>
      <path d="M30 0 C 62 130, -2 230, 30 330 S 62 530, 30 630 S -2 830, 30 1000" fill="none" stroke={MINT} strokeWidth="8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
