"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="gate"
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
      <h2>{mode === "in" ? "Sign in" : "Create your account"}</h2>
      <input name="email" type="email" placeholder="Email" autoComplete="email" required />
      <input
        name="password"
        type="password"
        placeholder="Password (8+ characters)"
        minLength={8}
        autoComplete={mode === "in" ? "current-password" : "new-password"}
        required
      />
      <button disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}</button>
      {error && <p className="error">{error}</p>}
      <button type="button" className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
      </button>
    </form>
  );
}
