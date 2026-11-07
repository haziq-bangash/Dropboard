import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-5 pb-10 pt-14 text-center sm:pt-20">
      <Link href="/#ai" className="mb-6">
        <Badge variant="outline" className="h-7 gap-1.5 rounded-full px-3 text-sm font-normal">
          <Sparkles className="size-3.5 text-brand" />
          New: ask your data in plain English
          <ArrowRight className="size-3.5" />
        </Badge>
      </Link>

      <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
        Turn any spreadsheet into a <em className="font-serif font-medium italic text-brand-text">dashboard</em>
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-balance text-muted-foreground">
        Drop an Excel, CSV or JSON file and get KPIs and charts in seconds. No signup to start, and your rows never leave your browser.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" className="rounded-full px-6" render={<Link href="/#upload" />} nativeButton={false}>
          Drop a file <ArrowRight />
        </Button>
        <Button size="lg" variant="outline" className="rounded-full px-6" render={<Link href="/#how" />} nativeButton={false}>
          How it works
        </Button>
      </div>
    </section>
  );
}
