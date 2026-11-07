"use client";

import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { AppSidebar } from "./AppSidebar";

/**
 * The signed-in frame: sidebar on the left, page on the right. Visitors without a session cookie never get here (see
 * proxy.ts), and an expired session is sent to sign in when a request comes back 401 (see query-provider.tsx).
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const { data: session, isPending, isRefetching } = authClient.useSession();

  // right after signing in the cached session can still read "signed out" for a moment
  if (isPending || isRefetching) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="grid min-h-screen place-items-center px-5 text-center">
        <div>
          <p className="text-lg font-medium">Your session has ended</p>
          <Link
            href="/login"
            className="mt-2 inline-block text-sm underline underline-offset-4"
          >
            Sign in again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          user={{
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
          }}
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
    </TooltipProvider>
  );
}
