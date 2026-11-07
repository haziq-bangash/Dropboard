import type { Metadata } from "next";
import { AuthArt } from "@/components/AuthArt";
import { PageShell } from "@/components/PageShell";
import { ResetForm } from "@/components/ResetForm";

export const metadata: Metadata = { title: "Reset password | Dropboard", robots: { index: false } };

export default function ResetPassword() {
  return (
    <PageShell className="flex justify-center py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border bg-card shadow-xl md:grid-cols-2">
        <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
          <ResetForm />
        </div>
        <AuthArt />
      </div>
    </PageShell>
  );
}
