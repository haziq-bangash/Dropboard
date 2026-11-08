"use client";

import { Suspense } from "react";
import { BillingSection } from "@/components/app/BillingSection";
import {
  DataSection,
  DeleteSection,
  PasswordSection,
  PlanSection,
  ProfileSection,
  SessionsSection,
} from "@/components/app/AccountSections";
import { authClient } from "@/lib/auth-client";
import { useAccountSummary } from "@/lib/queries";

export default function Account() {
  const { data: session } = authClient.useSession();
  const { data: summary } = useAccountSummary();
  if (!session) return null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Your{" "}
          <em className="font-serif text-[1.14em] italic text-brand-text">
            account
          </em>
        </h1>
        <p className="mt-2 text-muted-foreground">
          Your plan, how you sign in, and what we hold about you.
        </p>
      </div>
      <div className="flex max-w-3xl flex-col gap-6">
        <PlanSection />
      </div>
      {/* the plans are three tiles side by side, so they get a wider column than the forms */}
      <Suspense fallback={null}>
        <BillingSection />
      </Suspense>
      <div className="flex max-w-3xl flex-col gap-6">
        <ProfileSection />
        <PasswordSection summary={summary} />
        <SessionsSection />
        <DataSection userId={session.user.id} />
        <DeleteSection summary={summary} email={session.user.email} />
      </div>
    </div>
  );
}
