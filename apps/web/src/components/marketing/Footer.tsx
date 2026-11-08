import Link from "next/link";
import { Grain } from "@/components/art/Grain";
import { Logo } from "@/components/Logo";
import { ASSISTANT } from "@/lib/brand";

const COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [
      ["Features", "/#features"],
      ["How it works", "/#how"],
      [ASSISTANT, "/#pilot"],
      ["Pricing", "/pricing"],
    ],
  },
  {
    title: "Trust",
    links: [
      ["Trust center", "/trust"],
      ["Privacy by design", "/#privacy"],
      ["Safe sharing", "/#privacy"],
    ],
  },
  {
    title: "Account",
    links: [
      ["Sign in", "/login"],
      ["Create account", "/login"],
    ],
  },
];

/** The small print, along the bottom. */
const LEGAL: [string, string][] = [
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Trust center", "/trust"],
  ["Licence", "https://github.com/haziq-bangash/Dropboard/blob/main/LICENSE"],
];

export function Footer() {
  return (
    <footer
      className="relative isolate overflow-hidden"
      style={{ backgroundImage: "linear-gradient(to bottom, var(--background) 0%, var(--background) 35%, #FBE4CF 75%, #F8CFA6 100%)" }}
    >
      {/* grain behind the text, so the words stay crisp */}
      <Grain className="-z-10 opacity-40" />

      <div className="mx-auto w-full max-w-6xl px-5 pt-16">
        <div className="grid gap-10 md:grid-cols-[1.6fr_repeat(3,1fr)]">
          <div>
            <Link href="/" aria-label="Dropboard home" className="text-xl">
              <Logo />
            </Link>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Turn any spreadsheet into a dashboard, without handing over your data.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="mb-3 text-sm font-semibold">{col.title}</p>
              <ul className="grid gap-2 text-sm text-muted-foreground">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="transition-colors hover:text-foreground">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-foreground/15 pt-5 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Dropboard</p>
          <nav aria-label="Legal">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {LEGAL.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="transition-colors hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {/* layered hills with grain, like a printed landscape */}
      <div aria-hidden="true" className="relative mt-6 h-[220px] sm:h-[280px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/art/footer-hills.svg" alt="" className="absolute inset-0 h-full w-full" />
        {/* heavier grain, only over the hills */}
        <Grain className="opacity-80" />
      </div>
    </footer>
  );
}
