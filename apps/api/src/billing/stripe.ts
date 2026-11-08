import Stripe from "stripe";
import type { PlanId } from "../plans";

/** The few parts of Stripe's API that Dropboard uses. A fake stands in for it in tests; the real client satisfies it. */
export interface StripeApi {
  checkout: { sessions: { create(params: Record<string, unknown>): Promise<{ url: string | null }> } };
  billingPortal: { sessions: { create(params: Record<string, unknown>): Promise<{ url: string }> } };
  subscriptions: { retrieve(id: string): Promise<unknown> };
  webhooks: { constructEvent(payload: string, header: string, secret: string): StripeEvent };
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: unknown };
}

export interface BillingConfig {
  stripe: StripeApi;
  webhookSecret: string;
  /** The Stripe price for each paid plan. A plan without one cannot be bought. */
  prices: Partial<Record<Exclude<PlanId, "free">, string>>;
  /** Let Stripe work out tax at checkout. Needs Stripe Tax to be set up in the account, so it is off unless asked for. */
  automaticTax: boolean;
  /** Where checkout and the billing portal send people back to. */
  returnBase: string;
}

/**
 * Billing is switched on only when its keys are in the environment: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_PRO
 * (and STRIPE_PRICE_TEAM for the team plan). Without them the API behaves as if there were no paid plans, so nothing can be charged.
 * A live key is refused outside production, so a test run can never charge a real card.
 */
export function billingFromEnv(env: Record<string, string | undefined> = process.env): BillingConfig | undefined {
  const { STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: webhookSecret, STRIPE_PRICE_PRO: pro, STRIPE_PRICE_TEAM: team } = env;
  if (!key || !webhookSecret || !pro) return undefined;
  if (key.startsWith("sk_live_") && env.NODE_ENV !== "production") {
    console.warn("A live Stripe key is set outside production: billing stays off");
    return undefined;
  }
  return {
    stripe: new Stripe(key) as unknown as StripeApi,
    webhookSecret,
    prices: { pro, ...(team ? { team } : {}) },
    automaticTax: env.STRIPE_AUTOMATIC_TAX === "1",
    returnBase: (env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  };
}
