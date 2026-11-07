"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { Logo } from "./Logo";
import { ASSISTANT } from "@/lib/brand";

const LINKS: [string, string][] = [
  ["Features", "/#features"],
  ["How it works", "/#how"],
  [ASSISTANT, "/#pilot"],
  ["Privacy", "/#privacy"],
];

export function Header() {
  const { data: session, isPending } = authClient.useSession();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-5">
        <Link href="/" aria-label="Dropboard home">
          <Logo />
        </Link>
        <div className="hidden flex-1 items-center justify-center gap-6 md:flex">
          {LINKS.map(([label, href]) => (
            <Link key={label} href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {label}
            </Link>
          ))}
        </div>
        <span className="flex-1 md:hidden" />
        {isPending ? null : session ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground lg:inline">{session.user.email}</span>
            <Button variant="outline" size="sm" onClick={() => authClient.signOut()}>
              Sign out
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" render={<Link href="/login" />} nativeButton={false}>
              Sign in
            </Button>
            <Button size="sm" className="rounded-full" render={<Link href="/#upload" />} nativeButton={false}>
              Try it free
            </Button>
          </div>
        )}
      </nav>
    </header>
  );
}
