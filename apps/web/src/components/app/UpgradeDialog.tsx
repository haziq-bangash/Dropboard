"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** What a person sees when they ask for something the free plan does not include: what it is, and where to look at the plans. */
export function UpgradeDialog({ open, onOpenChange, what }: { open: boolean; onOpenChange: (open: boolean) => void; what: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{what} is part of Pro</DialogTitle>
          <DialogDescription>
            Pro also takes the badge off your published links, adds link expiry dates and view counts, and has room for 50 projects. Everything you have now keeps working on the free plan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button render={<Link href="/pricing" />} nativeButton={false} data-testid="see-plans">
            See the plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
