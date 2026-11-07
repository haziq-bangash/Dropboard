"use client";

import { STARTERS } from "@dropboard/engine";
import {
  Loader2,
  Megaphone,
  ShoppingCart,
  LifeBuoy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { starterFile, useStartProject } from "@/lib/start-project";

const ICONS: Record<string, LucideIcon> = {
  "ecommerce-orders": ShoppingCart,
  "household-spending": Wallet,
  "marketing-performance": Megaphone,
  "support-tickets": LifeBuoy,
};

/** Sample datasets that open as real projects, for anyone without a file at hand. The numbers are made up. */
export function StarterGrid() {
  const start = useStartProject();
  const opening = start.isPending ? start.variables?.file.name : null;

  return (
    <section aria-labelledby="starters-heading">
      <h2
        id="starters-heading"
        className="text-lg font-semibold tracking-tight"
      >
        No file at hand? Start from a sample
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each one opens as a real project you can edit and publish. The data is
        made up.
      </p>
      {start.error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{start.error.message}</AlertDescription>
        </Alert>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {STARTERS.map((s) => {
          const Icon = ICONS[s.id] ?? ShoppingCart;
          const busy = opening === s.fileName;
          return (
            <button
              key={s.id}
              type="button"
              disabled={start.isPending}
              onClick={() =>
                start.mutate({ file: starterFile(s), title: s.title })
              }
              className="group text-left disabled:opacity-60"
              data-testid="starter"
            >
              <Card className="h-full transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <CardContent className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary/60 text-brand-text">
                    {busy ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Icon className="size-5" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{s.title}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {s.description}
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {s.rows.toLocaleString()} rows · {s.shows}
                    </span>
                  </span>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </section>
  );
}
