import type { PrismaClient } from "./generated/prisma/client";

/**
 * What each plan allows, in one table. The API routes, the account page, the pricing page and Stripe all read it, so a limit is
 * written once. A person's plan comes from their subscription (see billing/); without one they are on the free plan.
 */
export type PlanId = "free" | "pro" | "team";

export interface Limits {
  plan: PlanId;
  /** Saved projects */
  projects: number;
  /** Published links that are not revoked */
  publishedLinks: number;
  /** Pilot requests per day */
  pilotPerDay: number;
  /** Exports: a chart's data as CSV, the story as a PDF. (A chart as PNG is free.) */
  exports: boolean;
  /** No "Made with Dropboard" badge on published links */
  noBadge: boolean;
  /** Expiry dates and view counts on published links */
  linkControls: boolean;
}

export interface PlanInfo {
  name: string;
  /** In cents of the plan's currency, per month. Zero for free. */
  priceMonthly: number;
  currency: "eur";
  limits: Omit<Limits, "plan">;
  /** What the plan includes beyond the limits, in words, for the pricing page. */
  highlights: string[];
}

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    name: "Free",
    priceMonthly: 0,
    currency: "eur",
    limits: { projects: 3, publishedLinks: 3, pilotPerDay: 10, exports: false, noBadge: false, linkControls: false },
    highlights: ["Dashboards, insights and stories", "Chart images (PNG)", "Password-protected links you can revoke", "A small badge on published links"],
  },
  pro: {
    name: "Pro",
    priceMonthly: 900,
    currency: "eur",
    limits: { projects: 50, publishedLinks: 50, pilotPerDay: 200, exports: true, noBadge: true, linkControls: true },
    highlights: ["No badge on published links", "Chart data as CSV and the story as a PDF", "Link expiry dates and view counts", "200 Pilot questions a day"],
  },
  team: {
    name: "Team",
    priceMonthly: 2900,
    currency: "eur",
    limits: { projects: 200, publishedLinks: 200, pilotPerDay: 500, exports: true, noBadge: true, linkControls: true },
    highlights: ["Everything in Pro", "Higher limits: 200 projects and 500 Pilot questions a day", "Shared workspaces are planned"],
  },
};

export const limitsOfPlan = (plan: PlanId): Limits => ({ plan, ...PLANS[plan].limits });

export const FREE: Limits = limitsOfPlan("free");

export type LimitsFor = (userId: string) => Promise<Limits>;

/** Stripe's subscription states that still count as paid. Past due is kept paid while Stripe retries the card; a canceled or unpaid one is not. */
export const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

/** The plan a stored subscription gives. Anything unrecognised or not paid is the free plan. */
export function planOf(sub: { plan: string; status: string } | null | undefined): PlanId {
  if (!sub || !PAID_STATUSES.has(sub.status)) return "free";
  return sub.plan === "pro" || sub.plan === "team" ? sub.plan : "free";
}

/** Limits for a person, from their subscription. */
export const createLimitsFor =
  (prisma: Pick<PrismaClient, "subscription">): LimitsFor =>
  async (userId) =>
    limitsOfPlan(planOf(await prisma.subscription.findUnique({ where: { userId }, select: { plan: true, status: true } })));

/** Everyone on the free plan. Used by tests that do not care about billing. */
export const limitsFor: LimitsFor = async () => FREE;
