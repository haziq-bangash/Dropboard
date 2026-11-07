"use client";

import { ArrowRight, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => (r.ok ? r.json() : { google: false }))
      .then((p) => setGoogle(Boolean(p.google)))
      .catch(() => {});
  }, []);

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

      {google && (
        <div className="mt-6">
          <div className="relative flex items-center">
            <div className="h-px flex-1 bg-border" />
            <span className="px-3 text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-6 h-11 w-full rounded-xl"
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
          >
            <GoogleMark />
            Continue with Google
          </Button>
        </div>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.27a12 12 0 0 0 0 10.76l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.27 6.62l4 3.1C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}
