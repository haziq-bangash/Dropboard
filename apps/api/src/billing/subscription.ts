import type { PrismaClient } from "../generated/prisma/client";
import type { PlanId } from "../plans";

/** The parts of a Stripe subscription that matter here. Stripe's own object has far more; this is read defensively. */
interface SubscriptionLike {
  id?: string;
  status?: string;
  customer?: string | { id: string };
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  items?: { data?: { price?: { id?: string }; current_period_end?: number }[] };
  metadata?: Record<string, string>;
}

type Db = Pick<PrismaClient, "subscription">;

export interface Prices {
  pro?: string;
  team?: string;
}

/** Which paid plan a Stripe price belongs to, or null for one this app does not sell. */
export const planForPrice = (prices: Prices, priceId: string | undefined): Exclude<PlanId, "free"> | null =>
  priceId ? ((["pro", "team"] as const).find((p) => prices[p] === priceId) ?? null) : null;

const customerId = (s: SubscriptionLike) => (typeof s.customer === "string" ? s.customer : s.customer?.id);

/**
 * Bring a person's stored subscription in step with what Stripe says. The period end moved from the subscription to its items in
 * newer Stripe versions, so both places are read. A price this app does not sell is ignored rather than guessed at.
 */
export async function applySubscription(db: Db, userId: string, raw: unknown, prices: Prices): Promise<"saved" | "ignored"> {
  const sub = raw as SubscriptionLike;
  const customer = customerId(sub);
  const plan = planForPrice(prices, sub.items?.data?.[0]?.price?.id);
  if (!customer || !plan || !sub.status) return "ignored";
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  const data = {
    stripeCustomerId: customer,
    stripeSubscriptionId: sub.id ?? null,
    plan,
    status: sub.status,
    currentPeriodEnd: end ? new Date(end * 1000) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
  await db.subscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return "saved";
}

/** The person a subscription belongs to: the one stored for its customer, else the one named in its metadata when it was made. */
export async function ownerOf(db: Db, raw: unknown): Promise<string | null> {
  const sub = raw as SubscriptionLike;
  const customer = customerId(sub);
  if (customer) {
    const row = await db.subscription.findUnique({ where: { stripeCustomerId: customer }, select: { userId: true } });
    if (row) return row.userId;
  }
  return sub.metadata?.userId ?? null;
}
