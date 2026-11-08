"use client";

import { addRequestedChart, measureChoices, textChoices, type ChartRequest, type TableProfile } from "@dropboard/engine";
import type { DashboardSpec } from "@dropboard/spec";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";

type Kind = ChartRequest["type"];

const KINDS: { type: Kind; name: string; blurb: string }[] = [
  { type: "treemap", name: "Treemap", blurb: "Tiles sized by an amount, one per group, and split by a second column if you like." },
  { type: "funnel", name: "Funnel", blurb: "Stages from the largest to the smallest." },
  { type: "sankey", name: "Flow diagram", blurb: "How things move from the values of one column to the values of another." },
];

const SELECT = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Pick({ label, value, onChange, options, none }: { label: string; value: string; onChange: (v: string) => void; options: string[]; none?: string }) {
  const id = `pick-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={SELECT} value={value} onChange={(e) => onChange(e.target.value)}>
        {none !== undefined && <option value="">{none}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Charts that suit only some data, so they are not drawn on their own: a treemap, a funnel or a flow diagram, built from
 * the columns a person chooses. Pilot can choose the same ones by naming columns.
 */
export function AddChartMenu({ profile, spec, onSpec }: { profile: TableProfile; spec: DashboardSpec; onSpec: (spec: DashboardSpec) => void }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [size, setSize] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const measures = measureChoices(profile).map((c) => c.name);
  const available = KINDS.filter((k) => textChoices(profile, k.type).length >= (k.type === "sankey" ? 2 : 1));
  if (available.length === 0) return null;

  const open = (type: Kind) => {
    const names = textChoices(profile, type).map((c) => c.name);
    setKind(type);
    setFirst(names[0] ?? "");
    setSecond(type === "sankey" ? (names[1] ?? "") : "");
    setSize("");
    setMessage(null);
  };

  const submit = () => {
    if (!kind) return;
    const measure = size || undefined;
    const request: ChartRequest =
      kind === "treemap"
        ? { type: "treemap", category: first, child: second || undefined, measure }
        : kind === "funnel"
          ? { type: "funnel", stage: first, measure }
          : { type: "sankey", from: first, to: second, measure };
    const next = addRequestedChart(spec, profile, request);
    if (typeof next === "string") return setMessage(next);
    onSpec(next);
    setKind(null);
  };

  const names = kind ? textChoices(profile, kind).map((c) => c.name) : [];
  const current = KINDS.find((k) => k.type === kind);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" className="rounded-full" />}>
          <BarChart3 /> Add a chart
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {available.map((k) => (
            <DropdownMenuItem key={k.type} onClick={() => open(k.type)}>
              {k.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={kind !== null} onOpenChange={(o) => !o && setKind(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a {current?.name.toLowerCase()}</DialogTitle>
            <DialogDescription>{current?.blurb}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Pick label={kind === "funnel" ? "Stages" : kind === "sankey" ? "Starts in" : "Groups"} value={first} onChange={setFirst} options={names} />
            {kind === "sankey" && <Pick label="Ends in" value={second} onChange={setSecond} options={names} />}
            {kind === "treemap" && <Pick label="Split each group by" value={second} onChange={setSecond} options={names.filter((n) => n !== first)} none="Nothing, one level" />}
            <Pick label="Sized by" value={size} onChange={setSize} options={measures} none="Number of rows" />
            {message && (
              <Alert variant="destructive">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKind(null)}>
              Cancel
            </Button>
            <Button onClick={submit}>Add chart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
