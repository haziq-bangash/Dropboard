"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function Header() {
  const { data: session, isPending } = authClient.useSession();
  return (
    <nav className="nav">
      <Link href="/" className="brand">
        Dropboard
      </Link>
      <span className="spacer" />
      {isPending ? null : session ? (
        <>
          <span className="muted">{session.user.email}</span>
          <button className="link" onClick={() => authClient.signOut()}>
            Sign out
          </button>
        </>
      ) : (
        <Link href="/login">Sign in</Link>
      )}
    </nav>
  );
}
