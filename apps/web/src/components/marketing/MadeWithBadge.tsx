import Link from "next/link";
import { LogoMark } from "@/components/Logo";

/** The small badge on a free plan's published links: where the dashboard was made, and a way to make one. */
export function MadeWithBadge() {
  return (
    <p className="mt-10 flex justify-center">
      <Link
        href="/"
        data-testid="made-with"
        className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-sm transition-shadow hover:shadow-md"
      >
        <LogoMark className="size-5" />
        Made with Dropboard
      </Link>
    </p>
  );
}
