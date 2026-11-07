import type { Metadata } from "next";
import { AuthArt } from "@/components/AuthArt";
import { AuthForm } from "@/components/AuthForm";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = { title: "Sign in | Dropboard", robots: { index: false } };

export default function Login() {
  return (
    <PageShell className="flex justify-center py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border bg-card shadow-xl md:grid-cols-2">
        <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
          <AuthForm />
        </div>
        <AuthArt />
      </div>
    </PageShell>
  );
}
