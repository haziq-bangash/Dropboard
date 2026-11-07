"use client";

import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { Accent, Shell } from "./AuthForm";

function Form() {
  const token = useSearchParams().get("token");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Shell
        title={
          <>
            Link <Accent>expired</Accent>
          </>
        }
        subtitle="This reset link is not valid any more."
      >
        <div className="mt-8 flex flex-col items-center gap-2">
          <p className="text-center text-sm text-muted-foreground">Links work once and for one hour. Ask for a new one and try again.</p>
          <Link href="/login" className="text-sm font-medium underline underline-offset-4">
            Back to sign in
          </Link>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell
        title={
          <>
            Password <Accent>updated</Accent>
          </>
        }
        subtitle="You can sign in with your new password now."
      >
        <Link
          href="/login"
          className="mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground"
        >
          Go to sign in
          <ArrowRight className="size-4" />
        </Link>
      </Shell>
    );
  }

  return (
    <Shell
      title={
        <>
          Choose a new <Accent>password</Accent>
        </>
      }
      subtitle="Pick something you have not used here before."
    >
      <form
        className="mt-8 flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const newPassword = String(f.get("password"));
          if (newPassword !== String(f.get("confirm"))) return setError("The two passwords do not match.");
          setBusy(true);
          setError(null);
          const { error } = await authClient.resetPassword({ newPassword, token });
          setBusy(false);
          if (error) setError("This link is no longer valid. Ask for a new one from the sign-in page.");
          else setDone(true);
        }}
      >
        {(["password", "confirm"] as const).map((name) => (
          <div key={name} className="grid gap-2">
            <Label htmlFor={name}>{name === "password" ? "New password" : "Confirm password"}</Label>
            <div className="relative">
              <Input
                id={name}
                name={name}
                type="password"
                minLength={8}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
                className="h-11 pr-10"
              />
              <Lock className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        ))}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" className="h-11 w-full rounded-xl" disabled={busy}>
          {busy ? "Please wait…" : "Update password"}
          {!busy && <ArrowRight />}
        </Button>
      </form>
    </Shell>
  );
}

export function ResetForm() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
