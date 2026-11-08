/** The pieces of the homepage's "Why Dropboard" tiles, shared so the app's sample cards look the same. */

export const bentoBase =
  "group relative isolate flex flex-col justify-end overflow-hidden rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl min-h-[220px]";

/** Big display text in the serif face, tight and without a letter-spacing change. */
export function Stat({ children }: { children: React.ReactNode }) {
  return <p className="font-serif leading-[0.9] tracking-normal">{children}</p>;
}

/** A small tilted pill that straightens on hover. */
export function Chip({ children, tilt, className }: { children: React.ReactNode; tilt: string; className?: string }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-sm font-medium shadow-sm transition-transform duration-300 group-hover:rotate-0 ${tilt} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
