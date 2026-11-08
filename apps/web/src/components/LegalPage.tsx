import { LEGAL_UPDATED } from "@/lib/brand";
import { PageShell } from "@/components/PageShell";

/** A long page of plain text: a serif title, when it last changed, and sections that read as one document. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <PageShell className="py-12">
      <article className="mx-auto max-w-3xl">
        <h1 className="font-serif text-5xl leading-[1.05] font-normal tracking-normal text-balance sm:text-6xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-8 text-lg text-balance">{intro}</p>
        <div className="mt-10 flex flex-col gap-10">{children}</div>
      </article>
    </PageShell>
  );
}

/** One numbered-feeling part of a legal page: a heading, then paragraphs and lists. */
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-foreground/15 pt-6 [&_a]:underline [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
      <h2 className="font-serif text-3xl leading-tight font-normal tracking-normal">{title}</h2>
      {children}
    </section>
  );
}
