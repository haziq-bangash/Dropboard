import { cn } from "@/lib/utils";

/** Film-grain overlay. Put it inside a `relative` container, behind the content (give the content `relative z-10`). */
export function Grain({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("grain-layer pointer-events-none absolute inset-0 opacity-50", className)} />;
}
