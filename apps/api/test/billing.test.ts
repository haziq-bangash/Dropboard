import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { createAuth } from "../src/auth";
import { billingFromEnv, type BillingConfig, type StripeApi } from "../src/billing/stripe";
import { applySubscription, planForPrice } from "../src/billing/subscription";
import { createLimitsFor, limitsOfPlan, PLANS, planOf } from "../src/plans";
import { createPrisma } from "../src/db";

vi.setConfig({ testTimeout: 60_000 });
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.BETTER_AUTH_URL ??= "http://localhost:8080";
process.env.DATABASE_URL ??= "postgres://dropboard:dropboard@localhost:5432/dropboard";
const ORIGIN = process.env.BETTER_AUTH_URL;
const SECRET = "whsec_test_secret";
const PRICES = { pro: "price_pro", team: "price_team" };

// Stripe's own code checks the signature (it works offline); everything that would call the network is a fake
const sdk = new Stripe("sk_test_offline");

const subscription = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  status: "active",
  customer: "cus_1",
  cancel_at_period_end: false,
  items: { data: [{ price: { id: PRICES.pro }, current_period_end: 1893456000 }] },
  metadata: {},
  ...over,
});

const spec = { version: 1, title: "Sales", schema: [{ name: "x", type: "number" }], charts: [{ id: "c1", type: "bar", title: "b", query: "SELECT 1 AS x", layout: { x: 0, y: 0, w: 1, h: 1 } }] };

describe("the plans table", () => {
  it("has a free, a pro and a team plan, each more generous than the one before", () => {
    expect(PLANS.free.priceMonthly).toBe(0);
    expect(PLANS.pro.priceMonthly).toBe(900);
    expect(PLANS.team.priceMonthly).toBe(2900);
    for (const [a, b] of [["free", "pro"], ["pro", "team"]] as const) {
      expect(PLANS[b].limits.projects).toBeGreaterThan(PLANS[a].limits.projects);
      expect(PLANS[b].limits.pilotPerDay).toBeGreaterThan(PLANS[a].limits.pilotPerDay);
    }
    expect(limitsOfPlan("free")).toMatchObject({ projects: 3, publishedLinks: 3, pilotPerDay: 10, exports: false, noBadge: false, linkControls: false });
    expect(limitsOfPlan("pro")).toMatchObject({ projects: 50, publishedLinks: 50, pilotPerDay: 200, exports: true, noBadge: true, linkControls: true });
  });
  it("counts a subscription as paid only while Stripe says it is", () => {
    for (const status of ["active", "trialing", "past_due"]) expect(planOf({ plan: "pro", status }), status).toBe("pro");
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", ""]) expect(planOf({ plan: "pro", status }), status).toBe("free");
    expect(planOf(null)).toBe("free");
    expect(planOf({ plan: "enterprise", status: "active" })).toBe("free");
    expect(planOf({ plan: "team", status: "active" })).toBe("team");
  });
  it("maps a Stripe price to the plan that was sold with it, and nothing else", () => {
    expect(planForPrice(PRICES, "price_pro")).toBe("pro");
    expect(planForPrice(PRICES, "price_team")).toBe("team");
    expect(planForPrice(PRICES, "price_other")).toBeNull();
    expect(planForPrice({}, "price_pro")).toBeNull();
    expect(planForPrice(PRICES, undefined)).toBeNull();
  });
});

describe("whether billing is on", () => {
  it("is off without the keys, and on with the three it needs", () => {
    expect(billingFromEnv({})).toBeUndefined();
    expect(billingFromEnv({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" })).toBeUndefined(); // no price
    const on = billingFromEnv({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x", STRIPE_PRICE_PRO: "price_a", BETTER_AUTH_URL: "https://example.test/" });
    expect(on?.prices).toEqual({ pro: "price_a" });
    expect(on?.returnBase).toBe("https://example.test");
    expect(on?.automaticTax).toBe(false);
    expect(billingFromEnv({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "w", STRIPE_PRICE_PRO: "a", STRIPE_PRICE_TEAM: "b", STRIPE_AUTOMATIC_TAX: "1" })).toMatchObject({ prices: { pro: "a", team: "b" }, automaticTax: true });
  });
  it("refuses a live key outside production, so a test can never charge a card", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = { STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "w", STRIPE_PRICE_PRO: "p" };
    expect(billingFromEnv({ ...env, NODE_ENV: "test" })).toBeUndefined();
    expect(billingFromEnv(env)).toBeUndefined();
    expect(billingFromEnv({ ...env, NODE_ENV: "production" })).toBeDefined();
    warn.mockRestore();
  });
});

describe("billing (real Postgres)", () => {
  const prisma = createPrisma();
  const calls = { checkout: [] as Record<string, unknown>[], portal: [] as Record<string, unknown>[], retrieve: [] as string[] };
  let current: Record<string, unknown> = subscription();
  let failRetrieve = 0;
  const stripe: StripeApi = {
    checkout: { sessions: { create: async (p) => (calls.checkout.push(p), { url: "https://checkout.stripe.test/session" }) } },
    billingPortal: { sessions: { create: async (p) => (calls.portal.push(p), { url: "https://billing.stripe.test/portal" }) } },
    subscriptions: {
      retrieve: async (id) => {
        calls.retrieve.push(id);
        if (failRetrieve > 0) {
          failRetrieve--;
          throw new Error("stripe is down");
        }
        return current;
      },
    },
    webhooks: sdk.webhooks as unknown as StripeApi["webhooks"],
  };
  const billing: BillingConfig = { stripe, webhookSecret: SECRET, prices: PRICES, automaticTax: false, returnBase: "https://dropboard.test" };
  const off = createApp({ prisma, auth: createAuth(prisma) });
  const on = createApp({ prisma, auth: createAuth(prisma), billing });
  const emails: string[] = [];
  const eventIds: string[] = [];

  afterAll(async () => {
    await prisma.stripeEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  async function person(plan?: { plan: string; status: string; customer: string }) {
    const email = `billing-${crypto.randomUUID()}@test.local`;
    emails.push(email);
    const res = await off.request("/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ email, password: "correct-horse-battery", name: "billing" }) });
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    if (plan) await prisma.subscription.create({ data: { userId: user.id, stripeCustomerId: plan.customer, plan: plan.plan, status: plan.status } });
    return { cookie, userId: user.id, email };
  }
  const call = (app: typeof on, path: string, cookie: string | null, body?: unknown, method = "POST") =>
    app.request(path, { method, headers: { "content-type": "application/json", origin: ORIGIN, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const hook = (event: { id: string; type: string; object: unknown }, options: { signature?: string | null; secret?: string } = {}) => {
    eventIds.push(event.id);
    const payload = JSON.stringify({ id: event.id, object: "event", type: event.type, data: { object: event.object } });
    const header = options.signature === undefined ? sdk.webhooks.generateTestHeaderString({ payload, secret: options.secret ?? SECRET }) : options.signature;
    return on.request("/api/billing/webhook", { method: "POST", headers: { "content-type": "application/json", ...(header ? { "stripe-signature": header } : {}) }, body: payload });
  };

  describe("with no Stripe keys", () => {
    it("lists the plans and says billing is off", async () => {
      const res = await off.request("/api/plans");
      const body = (await res.json()) as { billingEnabled: boolean; plans: { id: string; available: boolean; priceMonthly: number }[] };
      expect(body.billingEnabled).toBe(false);
      expect(body.plans.map((p) => [p.id, p.available, p.priceMonthly])).toEqual([["free", true, 0], ["pro", false, 900], ["team", false, 2900]]);
    });
    it("does not let anyone check out, manage billing or call the webhook", async () => {
      const { cookie } = await person();
      expect((await call(off, "/api/billing/checkout", cookie, { plan: "pro" })).status).toBe(503);
      expect((await call(off, "/api/billing/portal", cookie, {})).status).toBe(503);
      expect((await call(off, "/api/billing/webhook", null, {})).status).toBe(503);
      const summary = (await (await call(off, "/api/billing", cookie, undefined, "GET")).json()) as { plan: string; billingEnabled: boolean; canManage: boolean };
      expect(summary).toMatchObject({ plan: "free", billingEnabled: false, canManage: false });
    });
    it("keeps a person on the free plan's limits", async () => {
      const { cookie } = await person();
      const summary = (await (await call(off, "/api/me/summary", cookie, undefined, "GET")).json()) as { plan: string; usage: { projects: { max: number }; pilotToday: { max: number } } };
      expect(summary.plan).toBe("Free");
      expect(summary.usage.projects.max).toBe(3);
      expect(summary.usage.pilotToday.max).toBe(10);
    });
  });

  describe("checkout and the portal", () => {
    it("needs a signed-in person", async () => {
      expect((await call(on, "/api/billing/checkout", null, { plan: "pro" })).status).toBe(401);
      expect((await call(on, "/api/billing/portal", null, {})).status).toBe(401);
      expect((await call(on, "/api/billing", null, undefined, "GET")).status).toBe(401);
    });
    it("starts a subscription checkout for the chosen plan, tied to the person, and sends them back to the account page", async () => {
      const { cookie, userId, email } = await person();
      calls.checkout.length = 0;
      const res = await call(on, "/api/billing/checkout", cookie, { plan: "pro" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/session" });
      expect(calls.checkout[0]).toMatchObject({
        mode: "subscription",
        line_items: [{ price: "price_pro", quantity: 1 }],
        client_reference_id: userId,
        customer_email: email,
        subscription_data: { metadata: { userId, plan: "pro" } },
        success_url: "https://dropboard.test/app/account?billing=success",
        cancel_url: "https://dropboard.test/app/account?billing=cancelled",
      });
      expect(calls.checkout[0]).not.toHaveProperty("automatic_tax");
    });
    it("asks Stripe to work out tax only when that is switched on", async () => {
      const taxed = createApp({ prisma, auth: createAuth(prisma), billing: { ...billing, automaticTax: true } });
      const { cookie } = await person();
      calls.checkout.length = 0;
      await call(taxed, "/api/billing/checkout", cookie, { plan: "team" });
      expect(calls.checkout[0]).toMatchObject({ automatic_tax: { enabled: true }, line_items: [{ price: "price_team", quantity: 1 }] });
    });
    it("refuses a plan that cannot be bought, and anything that is not a paid plan", async () => {
      const { cookie } = await person();
      const proOnly = createApp({ prisma, auth: createAuth(prisma), billing: { ...billing, prices: { pro: "price_pro" } } });
      const res = await call(proOnly, "/api/billing/checkout", cookie, { plan: "team" });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe("plan_unavailable");
      expect((await call(on, "/api/billing/checkout", cookie, { plan: "free" })).status).toBe(400);
      expect((await call(on, "/api/billing/checkout", cookie, { plan: "enterprise" })).status).toBe(400);
      expect((await call(on, "/api/billing/checkout", cookie, {})).status).toBe(400);
    });
    it("does not let someone who already pays pay twice, and sends them to the portal", async () => {
      const { cookie } = await person({ plan: "pro", status: "active", customer: `cus_${crypto.randomUUID()}` });
      const res = await call(on, "/api/billing/checkout", cookie, { plan: "team" });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { code: string }).code).toBe("already_subscribed");
    });
    it("lets someone whose subscription ended buy again, as the same customer", async () => {
      const customer = `cus_${crypto.randomUUID()}`;
      const { cookie } = await person({ plan: "pro", status: "canceled", customer });
      calls.checkout.length = 0;
      expect((await call(on, "/api/billing/checkout", cookie, { plan: "pro" })).status).toBe(200);
      expect(calls.checkout[0]).toMatchObject({ customer });
      expect(calls.checkout[0]).not.toHaveProperty("customer_email");
    });
    it("opens the portal for the person's own customer only", async () => {
      const customer = `cus_${crypto.randomUUID()}`;
      const { cookie } = await person({ plan: "pro", status: "active", customer });
      calls.portal.length = 0;
      const res = await call(on, "/api/billing/portal", cookie, {});
      expect(await res.json()).toEqual({ url: "https://billing.stripe.test/portal" });
      expect(calls.portal[0]).toEqual({ customer, return_url: "https://dropboard.test/app/account" });
      const stranger = await person();
      const none = await call(on, "/api/billing/portal", stranger.cookie, {});
      expect(none.status).toBe(400);
      expect(((await none.json()) as { code: string }).code).toBe("no_subscription");
    });
    it("tells a person their plan, its state, and whether they can manage it", async () => {
      const { cookie } = await person({ plan: "team", status: "active", customer: `cus_${crypto.randomUUID()}` });
      const body = (await (await call(on, "/api/billing", cookie, undefined, "GET")).json()) as Record<string, unknown>;
      expect(body).toMatchObject({ billingEnabled: true, plan: "team", status: "active", canManage: true, cancelAtPeriodEnd: false });
      const plans = body.plans as { id: string; available: boolean }[];
      expect(plans.map((p) => [p.id, p.available])).toEqual([["free", true], ["pro", true], ["team", true]]);
    });
  });

  describe("the webhook", () => {
    it("turns a finished checkout into a paid plan with the plan's limits", async () => {
      const { cookie, userId } = await person();
      current = subscription({ id: "sub_a", customer: "cus_a_" + userId });
      const res = await hook({ id: `evt_${crypto.randomUUID()}`, type: "checkout.session.completed", object: { mode: "subscription", client_reference_id: userId, subscription: "sub_a", customer: "cus_a_" + userId } });
      expect(res.status).toBe(200);
      const row = await prisma.subscription.findUniqueOrThrow({ where: { userId } });
      expect(row).toMatchObject({ plan: "pro", status: "active", stripeCustomerId: "cus_a_" + userId, stripeSubscriptionId: "sub_a", cancelAtPeriodEnd: false });
      expect(row.currentPeriodEnd?.toISOString()).toBe(new Date(1893456000 * 1000).toISOString());
      const summary = (await (await call(on, "/api/me/summary", cookie, undefined, "GET")).json()) as { plan: string; planId: string; usage: { projects: { max: number }; publishedLinks: { max: number }; pilotToday: { max: number } } };
      expect(summary.plan).toBe("Pro");
      expect(summary.usage).toMatchObject({ projects: { max: 50 }, publishedLinks: { max: 50 }, pilotToday: { max: 200 } });
    });
    it("lets the new plan be used at once: a fourth project is allowed on pro, and refused on free", async () => {
      const free = await person();
      const pro = await person({ plan: "pro", status: "active", customer: `cus_${crypto.randomUUID()}` });
      for (let i = 0; i < 3; i++) {
        expect((await call(on, "/api/projects", free.cookie, { spec })).status).toBe(201);
        expect((await call(on, "/api/projects", pro.cookie, { spec })).status).toBe(201);
      }
      expect((await call(on, "/api/projects", free.cookie, { spec })).status).toBe(402);
      expect((await call(on, "/api/projects", pro.cookie, { spec })).status).toBe(201);
    });
    it("follows a change of plan, a cancellation scheduled for the end of the period, and the end of the subscription", async () => {
      const { userId } = await person();
      const customer = "cus_b_" + userId;
      await prisma.subscription.create({ data: { userId, stripeCustomerId: customer, plan: "pro", status: "active" } });

      current = subscription({ id: "sub_b", customer, status: "active", cancel_at_period_end: true });
      await hook({ id: `evt_${crypto.randomUUID()}`, type: "customer.subscription.updated", object: { id: "sub_b", customer } });
      expect(await prisma.subscription.findUniqueOrThrow({ where: { userId } })).toMatchObject({ plan: "pro", status: "active", cancelAtPeriodEnd: true });

      current = subscription({ id: "sub_b", customer, items: { data: [{ price: { id: PRICES.team }, current_period_end: 1893456000 }] } });
      await hook({ id: `evt_${crypto.randomUUID()}`, type: "customer.subscription.updated", object: { id: "sub_b", customer } });
      expect(await prisma.subscription.findUniqueOrThrow({ where: { userId } })).toMatchObject({ plan: "team", cancelAtPeriodEnd: false });

      current = subscription({ id: "sub_b", customer, status: "past_due" });
      await hook({ id: `evt_${crypto.randomUUID()}`, type: "customer.subscription.updated", object: { id: "sub_b", customer } });
      const lapsed = await prisma.subscription.findUniqueOrThrow({ where: { userId } });
      expect(lapsed.status).toBe("past_due");
      expect(planOf(lapsed)).toBe("pro"); // still paid while Stripe retries the card

      await hook({ id: `evt_${crypto.randomUUID()}`, type: "customer.subscription.deleted", object: { id: "sub_b", customer } });
      const ended = await prisma.subscription.findUniqueOrThrow({ where: { userId } });
      expect(ended).toMatchObject({ status: "canceled", cancelAtPeriodEnd: false });
      expect(planOf(ended)).toBe("free");
      expect(await createLimitsFor(prisma)(userId)).toMatchObject({ plan: "free", projects: 3 });
    });
    it("reads the subscription from Stripe, so an old event arriving late cannot undo a newer one", async () => {
      const { userId } = await person();
      const customer = "cus_c_" + userId;
      await prisma.subscription.create({ data: { userId, stripeCustomerId: customer, plan: "pro", status: "active" } });
      current = subscription({ id: "sub_c", customer, status: "canceled" }); // what Stripe says now
      // an "active" update that was sent long ago, arriving now
      await hook({ id: `evt_${crypto.randomUUID()}`, type: "customer.subscription.updated", object: { id: "sub_c", customer, status: "active" } });
      expect((await prisma.subscription.findUniqueOrThrow({ where: { userId } })).status).toBe("canceled");
    });
    it("finds the person from the subscription's metadata when the customer is new", async () => {
      const { userId } = await person();
      current = subscription({ id: "sub_d", customer: "cus_d_" + userId, metadata: { userId } });
      await hook({ id: `evt_${crypto.randomUUID()}`, type: "customer.subscription.created", object: { id: "sub_d", customer: "cus_d_" + userId, metadata: { userId } } });
      expect(await prisma.subscription.findUniqueOrThrow({ where: { userId } })).toMatchObject({ plan: "pro", stripeCustomerId: "cus_d_" + userId });
    });
    it("does something once, however many times Stripe sends the event", async () => {
      const { userId } = await person();
      const id = `evt_${crypto.randomUUID()}`;
      current = subscription({ id: "sub_e", customer: "cus_e_" + userId });
      const event = { id, type: "checkout.session.completed", object: { mode: "subscription", client_reference_id: userId, subscription: "sub_e" } };
      calls.retrieve.length = 0;
      expect(await (await hook(event)).json()).toEqual({ received: true });
      expect(await (await hook(event)).json()).toEqual({ received: true, duplicate: true });
      expect(calls.retrieve).toEqual(["sub_e"]);
      expect(await prisma.stripeEvent.count({ where: { id } })).toBe(1);
    });
    it("is retried when it fails, and does the work once Stripe answers", async () => {
      const { userId } = await person();
      const id = `evt_${crypto.randomUUID()}`;
      current = subscription({ id: "sub_f", customer: "cus_f_" + userId });
      const event = { id, type: "checkout.session.completed", object: { mode: "subscription", client_reference_id: userId, subscription: "sub_f" } };
      failRetrieve = 1;
      expect((await hook(event)).status).toBe(500);
      expect(await prisma.stripeEvent.count({ where: { id } })).toBe(0); // not recorded, so Stripe tries again
      expect(await prisma.subscription.findUnique({ where: { userId } })).toBeNull();
      expect((await hook(event)).status).toBe(200);
      expect((await prisma.subscription.findUniqueOrThrow({ where: { userId } })).plan).toBe("pro");
    });
    it("refuses what is not signed by Stripe", async () => {
      const { userId } = await person();
      const event = { id: `evt_${crypto.randomUUID()}`, type: "checkout.session.completed", object: { mode: "subscription", client_reference_id: userId, subscription: "sub_x" } };
      expect((await hook(event, { signature: null })).status).toBe(400);
      expect((await hook(event, { signature: "t=1,v1=deadbeef" })).status).toBe(400);
      expect((await hook(event, { secret: "whsec_someone_else" })).status).toBe(400);
      expect(await prisma.subscription.findUnique({ where: { userId } })).toBeNull();
      expect(await prisma.stripeEvent.count({ where: { id: event.id } })).toBe(0);
    });
    it("ignores a price it does not sell, a checkout that is not a subscription, and events it does not use", async () => {
      const { userId } = await person();
      current = subscription({ id: "sub_g", customer: "cus_g_" + userId, items: { data: [{ price: { id: "price_unknown" } }] } });
      await hook({ id: `evt_${crypto.randomUUID()}`, type: "checkout.session.completed", object: { mode: "subscription", client_reference_id: userId, subscription: "sub_g" } });
      await hook({ id: `evt_${crypto.randomUUID()}`, type: "checkout.session.completed", object: { mode: "payment", client_reference_id: userId, subscription: "sub_g" } });
      await hook({ id: `evt_${crypto.randomUUID()}`, type: "invoice.paid", object: { id: "in_1" } });
      expect(await prisma.subscription.findUnique({ where: { userId } })).toBeNull();
      expect(await applySubscription(prisma, userId, { id: "s", status: "active" }, PRICES)).toBe("ignored");
    });
  });

  describe("link controls", () => {
    const publish = (cookie: string, projectId: string, body: Record<string, unknown> = {}) => call(on, `/api/projects/${projectId}/share`, cookie, { results: { c1: [{ x: 1 }] }, ...body });
    async function project(cookie: string) {
      return ((await (await call(on, "/api/projects", cookie, { spec })).json()) as { id: string }).id;
    }

    it("keeps expiry dates for paid plans, and says so plainly to a free one", async () => {
      const free = await person();
      const res = await publish(free.cookie, await project(free.cookie), { expiresInDays: 7 });
      expect(res.status).toBe(402);
      expect(((await res.json()) as { code: string }).code).toBe("upgrade_required");
      const pro = await person({ plan: "pro", status: "active", customer: `cus_${crypto.randomUUID()}` });
      const ok = await publish(pro.cookie, await project(pro.cookie), { expiresInDays: 7 });
      expect(ok.status).toBe(201);
      const share = await prisma.share.findUniqueOrThrow({ where: { slug: ((await ok.json()) as { slug: string }).slug } });
      const days = (share.expiresAt!.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThan(7.01);
    });
    it("lets a free plan publish a link that does not expire", async () => {
      const free = await person();
      const res = await publish(free.cookie, await project(free.cookie));
      expect(res.status).toBe(201);
      expect((await prisma.share.findUniqueOrThrow({ where: { slug: ((await res.json()) as { slug: string }).slug } })).expiresAt).toBeNull();
    });
    it("shows the badge on a free plan's link, and not on a paid plan's, following the plan as it is now", async () => {
      const owner = await person();
      const id = await project(owner.cookie);
      const slug = ((await (await publish(owner.cookie, id)).json()) as { slug: string }).slug;
      const view = async () => ((await (await on.request(`/api/shares/${slug}`)).json()) as { badge: boolean }).badge;
      expect(await view()).toBe(true);
      await prisma.subscription.create({ data: { userId: owner.userId, stripeCustomerId: `cus_${crypto.randomUUID()}`, plan: "pro", status: "active" } });
      expect(await view()).toBe(false);
      await prisma.subscription.update({ where: { userId: owner.userId }, data: { status: "canceled" } });
      expect(await view()).toBe(true);
    });
    it("counts each time a link is opened, and shows the count to its owner", async () => {
      const owner = await person({ plan: "pro", status: "active", customer: `cus_${crypto.randomUUID()}` });
      const id = await project(owner.cookie);
      const slug = ((await (await publish(owner.cookie, id)).json()) as { slug: string }).slug;
      for (let i = 0; i < 3; i++) expect((await on.request(`/api/shares/${slug}`)).status).toBe(200);
      const detail = (await (await call(on, `/api/projects/${id}`, owner.cookie, undefined, "GET")).json()) as { shares: { slug: string; views: number; expiresAt: string | null }[] };
      expect(detail.shares[0]).toMatchObject({ slug, views: 3, expiresAt: null });
    });
    it("does not count a wrong password, or a link that is gone", async () => {
      const owner = await person();
      const id = await project(owner.cookie);
      const slug = ((await (await publish(owner.cookie, id, { password: "open-sesame" })).json()) as { slug: string }).slug;
      expect((await on.request(`/api/shares/${slug}`)).status).toBe(401);
      expect((await on.request(`/api/shares/${slug}`, { headers: { "x-share-password": "wrong-guess" } })).status).toBe(403);
      expect((await prisma.share.findUniqueOrThrow({ where: { slug } })).views).toBe(0);
      expect((await on.request(`/api/shares/${slug}`, { headers: { "x-share-password": "open-sesame" } })).status).toBe(200);
      expect((await prisma.share.findUniqueOrThrow({ where: { slug } })).views).toBe(1);
    });
    it("says a link has expired, without asking for its password or counting the visit", async () => {
      const owner = await person({ plan: "pro", status: "active", customer: `cus_${crypto.randomUUID()}` });
      const id = await project(owner.cookie);
      const slug = ((await (await publish(owner.cookie, id, { password: "open-sesame", expiresInDays: 1 })).json()) as { slug: string }).slug;
      await prisma.share.update({ where: { slug }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await on.request(`/api/shares/${slug}`);
      expect(res.status).toBe(410);
      expect(await res.json()).toEqual({ error: "This link has expired.", expired: true });
      expect((await prisma.share.findUniqueOrThrow({ where: { slug } })).views).toBe(0);
    });
    it("limits the length of an expiry", async () => {
      const owner = await person({ plan: "pro", status: "active", customer: `cus_${crypto.randomUUID()}` });
      const id = await project(owner.cookie);
      for (const days of [0, -1, 366, 1.5]) expect((await publish(owner.cookie, id, { expiresInDays: days })).status, String(days)).toBe(400);
    });
  });

  describe("Pilot's daily allowance", () => {
    it("follows the plan, and a single number set for everyone still wins", async () => {
      const team = await person({ plan: "team", status: "active", customer: `cus_${crypto.randomUUID()}` });
      const summary = async (app: typeof on) => ((await (await call(app, "/api/me/summary", team.cookie, undefined, "GET")).json()) as { usage: { pilotToday: { max: number } } }).usage.pilotToday.max;
      expect(await summary(on)).toBe(500);
      expect(await summary(createApp({ prisma, auth: createAuth(prisma), aiDailyLimit: 7 }))).toBe(7);
    });
  });
});
