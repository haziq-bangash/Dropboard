"use client";

import { ChevronDown, LayoutDashboard, LogOut, Menu, Settings } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { clearLocalData } from "@/lib/local-data";
import { setLoaded } from "@/lib/loaded-data";
import { Logo } from "./Logo";
import { ASSISTANT } from "@/lib/brand";

/** What the product does, gathered under one menu. */
const PRODUCT: [string, string][] = [
  ["Features", "/#features"],
  ["How it works", "/#how"],
  [ASSISTANT, "/#pilot"],
  ["Privacy by design", "/#privacy"],
];

/** On a phone there is room for one menu button, so everything goes in it. */
const ALL: [string, string][] = [...PRODUCT, ["Pricing", "/pricing"], ["Trust center", "/trust"], ["Privacy policy", "/privacy"], ["Terms of use", "/terms"]];

const ITEM = "rounded-xl px-3 py-2";
const MENU = "min-w-56 rounded-2xl p-2";
const NAV_LINK = "text-sm text-muted-foreground transition-colors hover:text-foreground";

export function Header() {
  const { data: session, isPending } = authClient.useSession();
  const name = session?.user.name.trim() || session?.user.email.split("@")[0] || "";
  const initial = name.charAt(0).toLowerCase();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-5">
        <Link href="/" aria-label="Dropboard home">
          <Logo />
        </Link>

        <div className="hidden flex-1 items-center justify-center gap-6 md:flex">
          <DropdownMenu>
            <DropdownMenuTrigger className={`${NAV_LINK} inline-flex items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
              Product
              <ChevronDown className="size-3.5" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className={MENU}>
              {PRODUCT.map(([label, href]) => (
                <DropdownMenuItem key={label} className={ITEM} render={<Link href={href} />}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/pricing" className={NAV_LINK}>
            Pricing
          </Link>
          <Link href="/trust" className={NAV_LINK}>
            Trust center
          </Link>
        </div>
        <span className="flex-1 md:hidden" />

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Menu" />}>
            <Menu />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={MENU}>
            {ALL.map(([label, href]) => (
              <DropdownMenuItem key={label} className={ITEM} render={<Link href={href} />}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {isPending ? null : session ? (
          <div className="flex items-center gap-3">
            <Button size="sm" className="rounded-full" render={<Link href="/app" />} nativeButton={false}>
              Open app
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account menu"
                className="grid size-9 place-items-center rounded-full bg-secondary font-serif text-xl leading-none text-secondary-foreground outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
              >
                {initial}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-64 rounded-2xl p-2">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-serif text-2xl leading-none text-secondary-foreground">{initial}</span>
                    <span className="grid min-w-0 leading-tight">
                      <span className="truncate font-serif text-lg text-foreground">{name}</span>
                      <span className="truncate text-xs text-muted-foreground">{session.user.email}</span>
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem className={ITEM} render={<Link href="/app" />}>
                  <LayoutDashboard />
                  Open app
                </DropdownMenuItem>
                <DropdownMenuItem className={ITEM} render={<Link href="/app/account" />}>
                  <Settings />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={ITEM}
                  onClick={async () => {
                    setLoaded(null);
                    await clearLocalData();
                    await authClient.signOut();
                  }}
                >
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
