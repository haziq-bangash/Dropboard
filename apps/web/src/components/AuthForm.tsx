"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { ASSISTANT } from "@/lib/brand";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card className="mx-auto mt-10 w-full max-w-sm">
      <CardHeader>
        <CardTitle>{mode === "in" ? "Sign in to Dropboard" : "Create your account"}</CardTitle>
        <CardDescription>
          {mode === "in" ? "Welcome back. Enter your details to continue." : `Publish links and use ${ASSISTANT} on your dashboards.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const f = new FormData(e.currentTarget);
            const email = String(f.get("email"));
            const password = String(f.get("password"));
            const { error } =
              mode === "in"
                ? await authClient.signIn.email({ email, password })
                : await authClient.signUp.email({ email, password, name: email.split("@")[0] });
            setBusy(false);
            if (error) setError(error.message ?? "Something went wrong.");
            else router.push("/");
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="you@company.com" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="At least 8 characters"
              minLength={8}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              required
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}
          </Button>
          <Button type="button" variant="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
