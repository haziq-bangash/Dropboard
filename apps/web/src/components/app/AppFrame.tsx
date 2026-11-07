"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { AppSidebar } from "./AppSidebar";
import { ProjectsProvider } from "./projects-store";

/** The signed-in frame: sidebar on the left, page on the right. Sends signed-out visitors to the sign-in page. */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const {
    data: session,
    isPending,
    isRefetching,
    refetch,
  } = authClient.useSession();

  // Right after signing in, the cached session can still read "signed out" for a moment. Ask the server before
  // sending anyone back to the sign-in page.
  useEffect(() => {
    if (isPending || isRefetching || session) return;
    let cancelled = false;
    void authClient.getSession().then((r) => {
      if (cancelled) return;
      if (r.data) void refetch();
      else router.replace("/login");
    });
    return () => {
      cancelled = true;
    };
  }, [isPending, isRefetching, session, router, refetch]);

  if (!session) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <TooltipProvider>
      <ProjectsProvider>
        <SidebarProvider>
          <AppSidebar
            user={{ name: session.user.name, email: session.user.email }}
          />
          <SidebarInset>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 md:hidden">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="h-4" />
              <span className="text-sm font-medium">Dropboard</span>
            </header>
            <div className="flex-1">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </ProjectsProvider>
    </TooltipProvider>
  );
}
