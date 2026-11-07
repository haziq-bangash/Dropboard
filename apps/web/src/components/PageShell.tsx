import { cn } from "@/lib/utils";

/** Standard page width and padding for app pages (marketing sections manage their own width). */
export function PageShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 py-8", className)}>{children}</div>;
}
