"use client";

import {
  BookOpen,
  ChevronsUpDown,
  FolderKanban,
  Globe,
  LogOut,
  Plus,
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
import { Logo } from "../Logo";
import { UsageMeter } from "./UsageMeter";

const NAV = [
  {
    href: "/app",
    label: "Projects",
    icon: FolderKanban,
    match: (p: string) => p === "/app" || p.startsWith("/app/p/"),
  },
  {
    href: "/app/new",
    label: "New project",
    icon: Plus,
    match: (p: string) => p === "/app/new",
  },
];

export function AppSidebar({
  user,
}: {
  user: { id: string; name: string; email: string };
}) {
  const pathname = usePathname();
  const router = useRouter();

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
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
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
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sm font-medium text-sidebar-primary-foreground">
                  {(user.name || user.email).charAt(0).toLowerCase()}
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-medium">
                    {user.email}
                  </span>
                </span>
                <ChevronsUpDown className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="min-w-56"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                    {user.email}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    showGuideAgain(user.id);
                    router.push("/app");
                  }}
                >
                  <BookOpen />
                  Show the guide again
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
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
