import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "./queries";

export type PlanId = "free" | "pro" | "team";

export interface PlanInfo {
  id: PlanId;
  name: string;
  /** In cents, per month. */
  priceMonthly: number;
  currency: "eur";
  highlights: string[];
  /** Can be bought right now (billing is on and the plan has a price). Free is always available. */
  available: boolean;
}

export interface PublicPlans {
  billingEnabled: boolean;
  plans: PlanInfo[];
}

export interface BillingSummary extends PublicPlans {
  plan: PlanId;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** There is a subscription to manage in Stripe's portal. */
  canManage: boolean;
}

/** An error from the billing API, carrying the server's code (such as "already_subscribed"). */
export class BillingError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function post(path: string, body: unknown): Promise<{ url: string }> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as { url?: string; error?: string; code?: string } | null;
  if (!res.ok || !json?.url) throw new BillingError(json?.error ?? "Something went wrong. Please try again.", json?.code);
  return { url: json.url };
}

/** The plans and what they cost, for anyone: the pricing page. */
export function usePublicPlans() {
  return useQuery<PublicPlans>({
    queryKey: keys.plans,
    queryFn: async () => {
      const res = await fetch("/api/plans");
      if (!res.ok) throw new BillingError("Could not load the plans.");
      return (await res.json()) as PublicPlans;
    },
    staleTime: 5 * 60_000,
  });
}

/** A signed-in person's plan and billing state. */
export function useBilling({ enabled = true, waitForPaid = false }: { enabled?: boolean; waitForPaid?: boolean } = {}) {
  return useQuery<BillingSummary>({
    queryKey: keys.billing,
    enabled,
    // right after checkout the plan changes when Stripe's message arrives, a moment later: look again until it has
    refetchInterval: (query) => (waitForPaid && query.state.data?.plan === "free" ? 2000 : false),
    queryFn: async () => {
      const res = await fetch("/api/billing");
      if (!res.ok) throw new BillingError("Could not load your billing details.");
      return (await res.json()) as BillingSummary;
    },
  });
}

/** Go to Stripe to pay for a plan. On success the browser leaves for Stripe's page. */
export function useCheckout() {
  return useMutation({
    mutationFn: (plan: Exclude<PlanId, "free">) => post("/api/billing/checkout", { plan }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
}

/** Go to Stripe's page to change plan, update a card, see invoices or cancel. */
export function usePortal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => post("/api/billing/portal", {}),
    onSuccess: ({ url }) => {
      void client.invalidateQueries({ queryKey: keys.billing });
      window.location.assign(url);
    },
  });
}

/** €9, or €9.50 when it is not a whole number of euros. */
export const price = (cents: number) => `€${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;
