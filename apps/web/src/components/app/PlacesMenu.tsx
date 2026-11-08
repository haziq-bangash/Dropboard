"use client";

import { addPlaceChart, placeColumnChoices, type PlaceKind, type TableProfile } from "@dropboard/engine";
import type { DashboardSpec } from "@dropboard/spec";
import { MapPin } from "lucide-react";
import { useState } from "react";
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

/**
 * Draws a shaded map for a column the person says holds countries or US states. Detection finds these on its own, but it
 * can miss one (a column of "Region" codes) and a person knows their data. A wrong map is taken off with the remove
 * button on its chart.
 */
export function PlacesMenu({ profile, spec, onSpec }: { profile: TableProfile; spec: DashboardSpec; onSpec: (spec: DashboardSpec) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const choices = placeColumnChoices(profile);

  const add = (kind: PlaceKind, column: string) => {
    const next = addPlaceChart(spec, profile, kind, column);
    if (typeof next === "string") return setMessage(next[0].toUpperCase() + next.slice(1) + ".");
    setMessage(null);
    onSpec(next);
  };

  if (choices.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" className="rounded-full" />}>
          <MapPin /> Map a column
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 min-w-56 overflow-y-auto">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Column of countries</DropdownMenuLabel>
            {choices.map((c) => (
              <DropdownMenuItem key={`country-${c.name}`} onClick={() => add("country", c.name)}>
                {c.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Column of US states</DropdownMenuLabel>
            {choices.map((c) => (
              <DropdownMenuItem key={`state-${c.name}`} onClick={() => add("us-state", c.name)}>
                {c.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
