import { zValidator } from "@hono/zod-validator";
import type { Hono, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";
import { PLANS, planOf, type PlanId } from "../plans";
import type { AppEnv } from "../types";
import { applySubscription, ownerOf } from "./subscription";
import type { BillingConfig, StripeEvent } from "./stripe";

interface Deps {
  prisma: PrismaClient;
  requireUser: MiddlewareHandler<AppEnv>;
  /** Present only when Stripe is configured. Without it every paid route says billing is not available. */
  billing?: BillingConfig;
}

const PAID = ["pro", "team"] as const;

/** The plans as the web app shows them: what each costs, includes, and whether it can be bought right now. */
export function planList(billing?: BillingConfig) {
  return (Object.keys(PLANS) as PlanId[]).map((id) => ({
    id,
    ...PLANS[id],
    available: id === "free" || Boolean(billing?.prices[id as (typeof PAID)[number]]),
  }));
}

/**
 * Billing: which plans exist, the person's own plan, checkout, the customer portal, and Stripe's webhook. Stripe is the source of
 * truth. The webhook keeps our stored subscription in step with it, and the person's limits are read from that.
 */
export function registerBillingRoutes(app: Hono<AppEnv>, { prisma, requireUser, billing }: Deps) {
  const unavailable = (c: Parameters<MiddlewareHandler<AppEnv>>[0]) =>
    c.json({ error: "Billing is not switched on yet.", code: "billing_unavailable" }, 503);

  // public: the pricing page
  app.get("/api/plans", (c) => c.json({ billingEnabled: Boolean(billing), plans: planList(billing) }));

  app.get("/api/billing", requireUser, async (c) => {
    const userId = c.get("userId");
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    return c.json({
      billingEnabled: Boolean(billing),
      plan: planOf(sub),
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      canManage: Boolean(billing && sub),
      plans: planList(billing),
    });
  });

  app.post("/api/billing/checkout", requireUser, zValidator("json", z.object({ plan: z.enum(PAID) })), async (c) => {
    if (!billing) return unavailable(c);
    const userId = c.get("userId");
    const { plan } = c.req.valid("json");
    const price = billing.prices[plan];
    if (!price) return c.json({ error: "That plan cannot be bought yet.", code: "plan_unavailable" }, 400);
    const [sub, user] = await Promise.all([
      prisma.subscription.findUnique({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    ]);
    // someone who already pays changes plan in the portal, not by paying twice
    if (planOf(sub) !== "free") return c.json({ error: "You already have a paid plan. Use Manage billing to change it.", code: "already_subscribed" }, 409);
    const session = await billing.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: userId,
      // a returning customer keeps their history; a new one is created from their email
      ...(sub ? { customer: sub.stripeCustomerId } : { customer_email: user?.email }),
      subscription_data: { metadata: { userId, plan } },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      ...(billing.automaticTax ? { automatic_tax: { enabled: true } } : {}),
      success_url: `${billing.returnBase}/app/account?billing=success`,
      cancel_url: `${billing.returnBase}/app/account?billing=cancelled`,
    });
    if (!session.url) return c.json({ error: "Could not start checkout.", code: "checkout_failed" }, 502);
    return c.json({ url: session.url });
  });

  app.post("/api/billing/portal", requireUser, async (c) => {
    if (!billing) return unavailable(c);
    const sub = await prisma.subscription.findUnique({ where: { userId: c.get("userId") }, select: { stripeCustomerId: true } });
    if (!sub) return c.json({ error: "There is no subscription to manage yet.", code: "no_subscription" }, 400);
    const session = await billing.stripe.billingPortal.sessions.create({ customer: sub.stripeCustomerId, return_url: `${billing.returnBase}/app/account` });
    return c.json({ url: session.url });
  });

  // Stripe calls this. The signature is checked against the raw body before anything is read from it, and each event is acted on once.
  app.post("/api/billing/webhook", bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "too large" }, 413) }), async (c) => {
    if (!billing) return unavailable(c);
    const signature = c.req.header("stripe-signature");
    if (!signature) return c.json({ error: "missing signature" }, 400);
    let event: StripeEvent;
    try {
      event = billing.stripe.webhooks.constructEvent(await c.req.text(), signature, billing.webhookSecret);
    } catch {
      return c.json({ error: "invalid signature" }, 400);
    }
    if (await prisma.stripeEvent.findUnique({ where: { id: event.id }, select: { id: true } })) return c.json({ received: true, duplicate: true });

    const object = event.data.object as { id?: string; client_reference_id?: string; mode?: string; subscription?: string | { id: string } };
    switch (event.type) {
      case "checkout.session.completed": {
        const subscriptionId = typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
        if (object.mode !== "subscription" || !object.client_reference_id || !subscriptionId) break;
        await applySubscription(prisma, object.client_reference_id, await billing.stripe.subscriptions.retrieve(subscriptionId), billing.prices);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const owner = await ownerOf(prisma, object);
        if (!owner) break;
        // the current state is read from Stripe, so events that arrive out of order cannot leave an old one in place
        const fresh = await billing.stripe.subscriptions.retrieve(object.id ?? "").catch(() => object);
        await applySubscription(prisma, owner, fresh, billing.prices);
        break;
      }
      case "customer.subscription.deleted": {
        const owner = await ownerOf(prisma, object);
        if (owner) await prisma.subscription.updateMany({ where: { userId: owner }, data: { status: "canceled", cancelAtPeriodEnd: false } });
        break;
      }
      default:
        break; // an event this app does not use is acknowledged and recorded, so Stripe stops sending it
    }
    // recorded only after the work succeeded: if it failed, Stripe retries and the work is done again (it is safe to repeat)
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } }).catch(() => undefined);
    return c.json({ received: true });
  });
}
