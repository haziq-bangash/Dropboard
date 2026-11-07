import { computeRows, FULL, rowPath } from "@/lib/logo-geometry";
import { cn } from "@/lib/utils";

const COLORS = {
  dark: { tile: "#075056", rows: "#FDF6E3" },
  // for dark backgrounds
  light: { tile: "#FDF6E3", rows: "#075056" },
} as const;
const ORANGE = "#FF5B04";

/** The Dropboard mark: a D sliced into spreadsheet rows, one of them highlighted. Same shapes as public/brand/logo-mark.svg. */
export function LogoMark({
  variant = "dark",
  className,
  title,
}: {
  variant?: keyof typeof COLORS;
  className?: string;
  /** Give it a label when it stands alone; leave it out when the wordmark sits next to it. */
  title?: string;
}) {
  const c = COLORS[variant];
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <rect width="100" height="100" rx="22" fill={c.tile} />
      {computeRows(FULL).map((row, i) => (
        <path key={i} d={rowPath(row, FULL)} fill={row.accent ? ORANGE : c.rows} />
      ))}
    </svg>
  );
}

/** The mark with the wordmark next to it. */
export function Logo({ className, variant = "dark" }: { className?: string; variant?: keyof typeof COLORS }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <LogoMark variant={variant} />
      Dropboard
    </span>
  );
}
