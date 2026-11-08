"use client";

import {
  BookOpen,
  ChevronsUpDown,
  FolderKanban,
  Globe,
  LogOut,
  Plus,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { showGuideAgain } from "@/lib/guide";
import { clearLocalData } from "@/lib/local-data";
import { setLoaded } from "@/lib/loaded-data";
import { markLeaving } from "@/lib/query-provider";
import { Logo } from "../Logo";
import { UsageMeter } from "./UsageMeter";

/** Every row is a pill, the open page in the same yellow as the homepage's tiles. */
const ROW = "rounded-full px-3 hover:bg-sidebar-accent data-active:bg-secondary data-active:text-secondary-foreground";

const NAV = [
  {
    href: "/app",
    label: "Projects",
    icon: FolderKanban,
    match: (p: string) => p === "/app" || p.startsWith("/app/p/"),
  },
  {
    href: "/app/account",
    label: "Account",
    icon: Settings,
    match: (p: string) => p === "/app/account",
  },
];

export function AppSidebar({
  user,
}: {
  user: { id: string; name: string; email: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  // addressed by name where there is one, and by the start of the email where there is not
  const name = user.name.trim() || user.email.split("@")[0];
  const first = name.split(/s+/)[0];
  const initial = name.charAt(0).toLowerCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/app"
          aria-label="Dropboard projects"
          className="flex h-10 items-center px-2"
        >
          <Logo />
        </Link>
        <p className="truncate px-2 pt-2 font-serif text-3xl leading-tight group-data-[collapsible=icon]:hidden" data-testid="sidebar-greeting">
          Hello, <em className="italic">{first}</em>
        </p>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-serif text-base italic text-sidebar-foreground/70">Your workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="New project"
                  className="mb-1 h-10 justify-center gap-2 rounded-full bg-sidebar-primary px-4 font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground"
                  isActive={pathname === "/app/new"}
                  render={<Link href="/app/new" />}
                >
                  <Plus />
                  <span>New project</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    className={ROW}
                    isActive={item.match(pathname)}
                    tooltip={item.label}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Back to the site"
                  className={ROW}
                  render={<Link href="/" />}
                >
                  <Globe />
                  <span>Back to the site</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UsageMeter />
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="h-auto rounded-2xl border border-sidebar-border bg-card py-2 data-open:bg-card" />}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary font-serif text-xl leading-none text-secondary-foreground">
                  {initial}
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-serif text-base">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
                <ChevronsUpDown className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="min-w-64 rounded-2xl p-2"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-serif text-2xl leading-none text-secondary-foreground">
                      {initial}
                    </span>
                    <span className="grid min-w-0 leading-tight">
                      <span className="truncate font-serif text-lg text-foreground">{name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="rounded-xl px-3 py-2" onClick={() => router.push("/app/account")}>
                  <Settings />
                  Account
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-xl px-3 py-2"
                  onClick={() => {
                    showGuideAgain(user.id);
                    router.push("/app");
                  }}
                >
                  <BookOpen />
                  Show the guide again
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="rounded-xl px-3 py-2"
                  onClick={async () => {
                    markLeaving();
                    setLoaded(null);
                    await clearLocalData();
                    await authClient.signOut();
                    router.push("/");
                  }}
                >
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
