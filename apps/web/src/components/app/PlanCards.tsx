"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { Grain } from "@/components/art/Grain";
import { bentoTile, Stat, TONES } from "@/components/marketing/bento";
import { Button } from "@/components/ui/button";
import { price, type PlanId, type PlanInfo } from "@/lib/billing";

const TONE: Record<PlanId, keyof typeof TONES> = { free: "grey", pro: "teal", team: "yellow" };

/**
 * The plans as three tiles, as on the homepage. What each button does depends on who is looking and whether billing is on: a visitor is
 * sent to sign in, a signed-in person on the free plan can upgrade, someone who already pays changes plan in Stripe's portal, and while
 * billing is off a paid plan says it is coming rather than offering something that cannot be bought.
 */
export function PlanCards({
  plans,
  current,
  billingEnabled,
  signedIn,
  pending,
  onChoose,
  onManage,
}: {
  plans: PlanInfo[];
  /** The signed-in person's plan. */
  current?: PlanId;
  billingEnabled: boolean;
  signedIn: boolean;
  /** The plan whose checkout is being opened. */
  pending?: PlanId | null;
  onChoose?: (plan: Exclude<PlanId, "free">) => void;
  onManage?: () => void;
}) {
  return (
    <ul className="grid gap-4 lg:grid-cols-3" data-testid="plans">
      {plans.map((p) => {
        const tone = TONE[p.id];
        const mine = current === p.id;
        const featured = p.id === "pro";
        const light = tone === "teal";
        return (
          <li key={p.id} data-testid={`plan-${p.id}`} data-current={mine || undefined} className={`${bentoTile} ${TONES[tone]} min-h-[400px] justify-between gap-6 p-7`}>
            {light && <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center opacity-20" style={{ backgroundImage: "url(/art/topo-lines-light.svg)" }} />}
            <Grain className="-z-10 opacity-40" />
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-serif text-3xl leading-none font-normal tracking-normal">{p.name}</h3>
                {mine ? (
                  <span className="rounded-full bg-white/85 px-3 py-1 text-sm font-medium text-foreground">Your plan</span>
                ) : featured ? (
                  <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">Most people</span>
                ) : null}
              </div>
              <Stat>
                <span className="block text-6xl">
                  {price(p.priceMonthly)}
                  <span className="ml-1 font-sans text-base font-normal tracking-normal">{p.priceMonthly === 0 ? "free, always" : "a month"}</span>
                </span>
              </Stat>
              <ul className="flex flex-col gap-2 text-sm">
                {p.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Action plan={p} mine={mine} current={current} billingEnabled={billingEnabled} signedIn={signedIn} pending={pending === p.id} light={light} onChoose={onChoose} onManage={onManage} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Action({
  plan,
  mine,
  current,
  billingEnabled,
  signedIn,
  pending,
  light,
  onChoose,
  onManage,
}: {
  plan: PlanInfo;
  mine: boolean;
  current?: PlanId;
  billingEnabled: boolean;
  signedIn: boolean;
  pending: boolean;
  light: boolean;
  onChoose?: (plan: Exclude<PlanId, "free">) => void;
  onManage?: () => void;
}) {
  const style = light ? "bg-secondary text-secondary-foreground hover:bg-secondary/90" : "";
  const base = `h-11 w-full rounded-full ${style}`;
  if (mine) {
    return (
      <Button className={base} variant={light ? "default" : "outline"} disabled>
        Your plan
      </Button>
    );
  }
  if (plan.id === "free") {
    // a visitor can start with no account at all
    return signedIn ? null : (
      <Button className={base} variant="outline" render={<Link href="/#upload" />} nativeButton={false}>
        Start free
      </Button>
    );
  }
  if (!billingEnabled || !plan.available) {
    return (
      <Button className={base} variant={light ? "default" : "outline"} disabled data-testid={`choose-${plan.id}`}>
        Coming soon
      </Button>
    );
  }
  if (!signedIn) {
    return (
      <Button className={base} variant={light ? "default" : "outline"} render={<Link href="/login" />} nativeButton={false} data-testid={`choose-${plan.id}`}>
        Sign in to upgrade
      </Button>
    );
  }
  if (current && current !== "free") {
    return (
      <Button className={base} variant={light ? "default" : "outline"} onClick={onManage} data-testid={`choose-${plan.id}`}>
        Change in Manage billing
      </Button>
    );
  }
  return (
    <Button className={base} variant={light ? "default" : "default"} disabled={pending} onClick={() => onChoose?.(plan.id as Exclude<PlanId, "free">)} data-testid={`choose-${plan.id}`}>
      {pending ? "Opening checkout…" : `Upgrade to ${plan.name}`}
    </Button>
  );
}
