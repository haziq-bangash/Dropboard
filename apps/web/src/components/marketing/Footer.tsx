import { BarChart3 } from "lucide-react";
import Link from "next/link";

const COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [
      ["Features", "/#features"],
      ["How it works", "/#how"],
      ["AI assistant", "/#ai"],
    ],
  },
  {
    title: "Trust",
    links: [
      ["Privacy by design", "/#privacy"],
      ["Safe sharing", "/#privacy"],
    ],
  },
  {
    title: "Account",
    links: [["Sign in", "/login"]],
  },
];

export function Footer() {
  return (
    <footer className="bg-foreground text-background">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div>
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <BarChart3 className="size-5" />
            Dropboard
          </Link>
          <p className="mt-3 max-w-xs text-sm opacity-70">Turn any spreadsheet into a dashboard, without handing over your data.</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="mb-3 text-sm font-medium">{col.title}</p>
            <ul className="grid gap-2 text-sm opacity-70">
              {col.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-background/15">
        <p className="mx-auto w-full max-w-6xl px-5 py-5 text-sm opacity-60">© {new Date().getFullYear()} Dropboard</p>
      </div>
    </footer>
  );
}
