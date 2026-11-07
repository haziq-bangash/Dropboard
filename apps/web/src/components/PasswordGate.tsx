"use client";

import type { DashboardSpec, ShareResults } from "@dropboard/spec";
import { Lock } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SnapshotView } from "./SnapshotView";

export function PasswordGate({ slug }: { slug: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{
    spec: DashboardSpec;
    results: ShareResults;
  } | null>(null);

  if (data) return <SnapshotView spec={data.spec} results={data.results} />;

  return (
    <Card className="mx-auto mt-10 w-full max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4" /> Password protected
        </CardTitle>
        <CardDescription>
          Enter the password to view this dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const res = await fetch(`/api/shares/${encodeURIComponent(slug)}`, {
              headers: { "x-share-password": password },
            });
            setBusy(false);
            if (res.ok) setData(await res.json());
            else if (res.status === 404)
              setError("This link is no longer available.");
            else if (res.status === 429)
              setError("Too many tries. Please wait a minute and try again.");
            else setError("Wrong password.");
          }}
        >
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            autoFocus
            required
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Checking…" : "View dashboard"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
