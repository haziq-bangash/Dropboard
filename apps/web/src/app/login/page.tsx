import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = { title: "Sign in | Dropboard", robots: { index: false } };

export default function Login() {
  return (
    <PageShell>
      <AuthForm />
    </PageShell>
  );
}
