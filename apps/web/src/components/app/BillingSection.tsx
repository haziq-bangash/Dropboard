"use client";

import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PlanCards } from "@/components/app/PlanCards";
import { useBilling, useCheckout, usePortal } from "@/lib/billing";

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/** The person's plan, what happens next with it, and the way to change it. Everything about cards and payment is on Stripe's pages. */
export function BillingSection() {
  const returned = useSearchParams().get("billing");
  const billing = useBilling({ waitForPaid: returned === "success" });
  const checkout = useCheckout();
  const portal = usePortal();
  const data = billing.data;

  if (billing.isPending || !data) {
    return <p className="text-sm text-muted-foreground">{billing.error ? billing.error.message : "Loading plans…"}</p>;
  }
  const paid = data.plan !== "free";
  const name = data.plans.find((p) => p.id === data.plan)?.name ?? "Free";
  const error = checkout.error?.message ?? portal.error?.message;

  return (
    <section aria-labelledby="plans-heading" className="flex flex-col gap-4" data-testid="billing">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="plans-heading" className="font-serif text-3xl leading-tight font-normal tracking-normal">
            Plans <em className="italic">and billing</em>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="billing-status">
            {!data.billingEnabled && !paid
              ? "Paid plans are not switched on yet. Everyone is on the free plan for now."
              : data.status === "past_due"
                ? `Your last payment did not go through. Update your card in Manage billing to keep ${name}.`
                : paid && data.cancelAtPeriodEnd && data.currentPeriodEnd
                  ? `Your ${name} plan ends on ${day(data.currentPeriodEnd)}. You keep it until then.`
                  : paid && data.currentPeriodEnd
                    ? `You are on ${name}. It renews on ${day(data.currentPeriodEnd)}.`
                    : paid
                      ? `You are on ${name}.`
                      : "You are on the free plan."}
          </p>
        </div>
        {data.canManage && (
          <Button variant="outline" className="rounded-full" disabled={portal.isPending} onClick={() => portal.mutate()} data-testid="manage-billing">
            {portal.isPending ? "Opening…" : "Manage billing"}
          </Button>
        )}
      </div>

      {returned === "success" && (
        <Alert data-testid="billing-thanks">
          <AlertDescription>{paid ? `Thank you. You are now on ${name}.` : "Thank you. Your plan will update in a moment."}</AlertDescription>
        </Alert>
      )}
      {returned === "cancelled" && (
        <Alert>
          <AlertDescription>Checkout was cancelled. Nothing was charged.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <PlanCards
        plans={data.plans}
        current={data.plan}
        billingEnabled={data.billingEnabled}
        signedIn
        pending={checkout.isPending ? checkout.variables : null}
        onChoose={(plan) => checkout.mutate(plan)}
        onManage={() => portal.mutate()}
      />
    </section>
  );
}
