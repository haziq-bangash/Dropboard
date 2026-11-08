import { cn } from "@/lib/utils";

/** The pieces of the homepage's "Why Dropboard" tiles, shared so the app's cards look the same. */

/** A tile with no size of its own: the rounded shape, the lift on hover, and the room for what is inside. */
export const bentoTile = "group relative isolate flex flex-col justify-end overflow-hidden rounded-3xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl";

/** A full-size tile, as on the homepage. */
export const bentoBase = `${bentoTile} p-6 min-h-[220px]`;

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

/** A title with its last word in the italic accent, as the homepage does ("Never indexed"). */
export function ItalicLast({ text }: { text: string }) {
  const words = text.split(" ");
  const last = words.pop();
  return (
    <>
      {words.length ? `${words.join(" ")} ` : ""}
      <em className="italic">{last}</em>
    </>
  );
}

/** The colours the tiles come in, from the homepage: teal, yellow, grey-blue, warm orange, dark slate, and the dashed white one. */
export const TONES = {
  teal: "bg-primary text-primary-foreground",
  yellow: "bg-secondary text-secondary-foreground",
  grey: "bg-[#D3DBDD] text-foreground",
  orange: "bg-gradient-to-br from-[#FFD59A] to-[#FF9A45] text-foreground",
  slate: "bg-foreground text-background",
  dashed: "border-2 border-dashed border-brand bg-card text-foreground",
} as const;

/** A message that stands in for something missing (no projects, nothing found, a file to attach), set as one of the tiles. */
export function EmptyTile({
  tone = "grey",
  eyebrow,
  title,
  children,
  className,
  ...rest
}: {
  tone?: keyof typeof TONES;
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "title">) {
  return (
    <div className={cn("relative isolate overflow-hidden rounded-3xl p-7 sm:p-9", TONES[tone], className)} {...rest}>
      {tone === "teal" || tone === "slate" ? (
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center opacity-[0.16]" style={{ backgroundImage: "url(/art/topo-lines-light.svg)" }} />
      ) : null}
      {eyebrow && <p className="text-sm font-medium tracking-wide opacity-75">{eyebrow}</p>}
      <Stat>
        <span className="mt-1 block text-4xl sm:text-5xl">
          <ItalicLast text={title} />
        </span>
      </Stat>
      {children && <div className="mt-4 max-w-2xl text-sm [&>p]:opacity-90">{children}</div>}
    </div>
  );
}
