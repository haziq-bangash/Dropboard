import { Copy, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ASSISTANT } from "@/lib/brand";
import { Switch } from "@/components/ui/switch";

// Static product mockups for the marketing page. Sample numbers only, not real data.

const BARS = [38, 55, 42, 70, 62, 88, 74];

export function MockDashboard() {
  return (
    <Card className="w-full shadow-lg">
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Revenue", "$48,210"],
            ["Orders", "1,284"],
            ["Avg. order", "$37.55"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold tracking-tight">{value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-lg border p-3">
          <p className="mb-3 text-sm font-medium">Revenue by month</p>
          <div className="flex h-28 items-end gap-2">
            {BARS.map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-primary/80" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MockChat() {
  return (
    <Card className="w-full shadow-lg">
      <CardContent className="flex flex-col gap-3">
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
          Which region had the highest revenue last quarter?
        </div>
        <div className="max-w-[90%] rounded-2xl rounded-bl-sm border p-3 text-sm">
          <p className="mb-2 font-medium">West led with $18.4k, ahead of North at $14.1k.</p>
          <div className="overflow-hidden rounded-md border text-xs">
            {[
              ["Region", "Revenue"],
              ["West", "$18,420"],
              ["North", "$14,130"],
              ["East", "$9,870"],
            ].map(([a, b], i) => (
              <div key={a} className={`flex justify-between px-3 py-1.5 ${i === 0 ? "bg-muted font-medium" : "border-t"}`}>
                <span>{a}</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{ASSISTANT} saw only column names. The answer was computed in the browser.</p>
      </CardContent>
    </Card>
  );
}

export function MockShare() {
  return (
    <Card className="w-full shadow-lg">
      <CardContent className="flex flex-col gap-3">
        <p className="font-medium">Publish dashboard</p>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <span className="flex-1 truncate">dropboard.app/s/k3J9x2Qa7Lp</span>
          <Copy className="size-4" />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
          <span className="flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" /> Password protection
          </span>
          <Switch checked aria-label="Password protection (example)" />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3 text-sm text-muted-foreground">
          <span>Search engine indexing</span>
          <Switch checked={false} disabled aria-label="Search engine indexing (example)" />
        </div>
      </CardContent>
    </Card>
  );
}
