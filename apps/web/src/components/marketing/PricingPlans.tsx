"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { PlanCards } from "@/components/app/PlanCards";
import { authClient } from "@/lib/auth-client";
import { useBilling, useCheckout, usePortal, usePublicPlans } from "@/lib/billing";

/** The plans for anyone to see; a signed-in person also gets their own state, so the buttons fit them. */
export function PricingPlans() {
  const { data: session } = authClient.useSession();
  const plans = usePublicPlans();
  const mine = useBilling({ enabled: Boolean(session) });
  const checkout = useCheckout();
  const portal = usePortal();

  if (plans.error) return <p className="text-muted-foreground">Could not load the plans. Please try again.</p>;
  if (!plans.data) return <p className="text-muted-foreground">Loading plans…</p>;
  const error = checkout.error?.message ?? portal.error?.message;
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <PlanCards
        plans={plans.data.plans}
        current={session ? mine.data?.plan : undefined}
        billingEnabled={plans.data.billingEnabled}
        signedIn={Boolean(session)}
        pending={checkout.isPending ? checkout.variables : null}
        onChoose={(plan) => checkout.mutate(plan)}
        onManage={() => portal.mutate()}
      />
      {!plans.data.billingEnabled && (
        <p className="text-sm text-muted-foreground" data-testid="pricing-note">
          Paid plans are not switched on yet. Everything on the free plan works today, and you do not need an account to start.
        </p>
      )}
    </div>
  );
}
