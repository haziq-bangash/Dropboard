"use client";

import { ArrowRight, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { Logo } from "./Logo";
import { ASSISTANT } from "@/lib/brand";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-8 flex justify-center">
        <Logo />
      </div>

      <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        {mode === "in" ? (
          <>
            Welcome <em className="font-serif text-[1.14em] italic text-brand-text">back</em>
          </>
        ) : (
          <>
            Create your <em className="font-serif text-[1.14em] italic text-brand-text">account</em>
          </>
        )}
      </h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        {mode === "in" ? "Enter your details to continue." : `Publish links and use ${ASSISTANT} on your dashboards.`}
      </p>

      <form
        className="mt-8 flex flex-col gap-4"
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
          <div className="relative">
            <Input id="email" name="email" type="email" placeholder="you@company.com" autoComplete="email" required className="h-11 pr-10" />
            <Mail className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="At least 8 characters"
              minLength={8}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              required
              className="h-11 pr-10"
            />
            <Lock className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" className="h-11 w-full rounded-xl" disabled={busy}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}
          {!busy && <ArrowRight />}
        </Button>
        <Button type="button" variant="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
        </Button>
      </form>
    </div>
  );
}
