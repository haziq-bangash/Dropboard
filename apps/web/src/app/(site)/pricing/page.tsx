import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { PricingPlans } from "@/components/marketing/PricingPlans";
import { ASSISTANT } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Pricing | Dropboard",
  description: "Start free, with no account. Pro and Team add exports, link controls and more room for projects and Pilot questions.",
};

export default function Pricing() {
  return (
    <PageShell className="flex flex-col gap-12 py-12">
      <header className="relative max-w-3xl">
        <span aria-hidden="true" className="absolute -left-4 top-8 -z-10 hidden h-28 w-24 bg-secondary sm:block" />
        <h1 className="font-serif text-5xl leading-[1.02] font-normal tracking-normal text-balance sm:text-7xl">
          Start free. <em className="italic">Pay for room.</em>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-balance">
          Every plan reads your files in your browser, and none of them uploads your rows. The paid plans add exports, link controls and more room for projects and {ASSISTANT} questions.
        </p>
      </header>
      <PricingPlans />
      <p className="max-w-2xl text-sm text-muted-foreground">
        You change or end a paid plan in Stripe&apos;s secure billing page, from your account. If a plan ends, your projects and links stay; you just cannot add more than the free plan allows, and
        published links show a small badge again. Questions: see the <Link href="/trust" className="underline underline-offset-4">trust center</Link> and the{" "}
        <Link href="/terms" className="underline underline-offset-4">terms</Link>.
      </p>
    </PageShell>
  );
}
