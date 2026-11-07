import {
  BarChart3,
  DollarSign,
  MapPin,
  Package,
  Percent,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

// Decorative hero: raw rows (gray placeholders) stream into the logo and come out as insight cards.
// Pure CSS. Each row draws the same moving track twice, the left half as placeholders and the right half
// as finished cards, so every card turns into an insight as it crosses the center line.
// All numbers are sample data for illustration only.

interface Insight {
  icon: LucideIcon;
  title: string;
  sub: string;
  value: string;
  delta: string;
  up: boolean;
}

const ROWS: { cards: Insight[]; duration: number; delay: number }[] = [
  {
    duration: 46,
    delay: 0,
    cards: [
      { icon: DollarSign, title: "Revenue", sub: "This month", value: "$48,210", delta: "11.5%", up: true },
      { icon: ShoppingCart, title: "Orders", sub: "This month", value: "1,284", delta: "9.3%", up: true },
      { icon: DollarSign, title: "Avg. order", sub: "This month", value: "$37.55", delta: "2.1%", up: true },
      { icon: Percent, title: "Refund rate", sub: "This month", value: "2.4%", delta: "0.6%", up: false },
      { icon: Users, title: "New customers", sub: "This month", value: "312", delta: "14.2%", up: true },
      { icon: DollarSign, title: "Ad spend", sub: "This month", value: "$6,940", delta: "4.6%", up: true },
    ],
  },
  {
    duration: 34,
    delay: -9,
    cards: [
      { icon: MapPin, title: "Top region", sub: "West", value: "$18,420", delta: "18.4%", up: true },
      { icon: Package, title: "Top product", sub: "SKU-204", value: "$9,870", delta: "12.4%", up: true },
      { icon: Users, title: "Returning", sub: "Buyers", value: "38%", delta: "3.2%", up: true },
      { icon: Percent, title: "Conversion", sub: "Checkout", value: "3.1%", delta: "0.4%", up: true },
      { icon: Package, title: "Units sold", sub: "This month", value: "5,872", delta: "7.9%", up: true },
      { icon: Percent, title: "Margin", sub: "Gross", value: "41%", delta: "1.8%", up: true },
    ],
  },
  {
    duration: 52,
    delay: -21,
    cards: [
      { icon: Users, title: "Sessions", sub: "This month", value: "24.8k", delta: "5.2%", up: true },
      { icon: ShoppingCart, title: "Cart adds", sub: "This month", value: "3,402", delta: "8.8%", up: true },
      { icon: Truck, title: "Shipping", sub: "Cost", value: "$2,114", delta: "3.1%", up: false },
      { icon: DollarSign, title: "Net profit", sub: "This month", value: "$12,640", delta: "10.7%", up: true },
      { icon: ShoppingCart, title: "Best day", sub: "Saturday", value: "214", delta: "6.0%", up: true },
      { icon: Package, title: "Stock left", sub: "Units", value: "842", delta: "2.4%", up: false },
    ],
  },
];

const CARD = "flex h-[68px] w-72 shrink-0 items-center gap-3 rounded-xl border p-3";

function PlaceholderCard() {
  return (
    <div className={`${CARD} bg-card/70`}>
      <div className="size-11 rounded-lg bg-muted" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-2.5 w-16 rounded bg-muted" />
      </div>
      <div className="h-9 w-px bg-border" />
      <div className="flex w-16 flex-col gap-2">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-2.5 w-10 rounded bg-muted" />
      </div>
    </div>
  );
}

function InsightCard({ icon: Icon, title, sub, value, delta, up }: Insight) {
  const Arrow = up ? TrendingUp : TrendingDown;
  return (
    <div className={`${CARD} bg-card shadow-sm`}>
      <div className="flex size-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
      <div className="h-9 w-px bg-border" />
      <div className="w-[76px]">
        <p className="text-sm font-semibold text-primary">{value}</p>
        <span
          className={`mt-0.5 inline-flex items-center gap-1 rounded px-1 text-[10px] font-medium ${
            up ? "bg-secondary text-secondary-foreground" : "bg-destructive/10 text-destructive"
          }`}
        >
          <Arrow className="size-2.5" />
          {delta}
        </span>
      </div>
    </div>
  );
}

function Row({ cards, duration, delay }: { cards: Insight[]; duration: number; delay: number }) {
  // The sequence is rendered twice and shifted by exactly one copy, so the loop has no visible jump.
  const sequence = [...cards, ...cards];
  const track = (placeholder: boolean) => (
    <div
      className="flex w-max gap-4 pr-4 motion-safe:animate-flow-right"
      style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
    >
      {sequence.map((c, i) => (placeholder ? <PlaceholderCard key={i} /> : <InsightCard key={i} {...c} />))}
    </div>
  );
  return (
    <div className="relative h-[68px]">
      <div className="absolute inset-0 [clip-path:inset(0_50%_0_0)]">{track(true)}</div>
      <div className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">{track(false)}</div>
    </div>
  );
}

export function HeroFlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none mx-auto mt-4 w-full max-w-6xl select-none">
      <div className="relative h-[340px] overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="absolute inset-x-0 top-4 flex flex-col gap-6">
          {ROWS.map((row, i) => (
            <Row key={i} {...row} />
          ))}
        </div>

        {/* beam through the logo, then a funnel that ends at the drop zone below */}
        <div className="absolute inset-y-0 left-1/2 z-10 w-1.5 -translate-x-1/2 rounded-full bg-gradient-to-b from-brand/0 via-brand to-primary shadow-[0_0_24px_rgba(255,91,4,0.45)]" />
        <svg
          viewBox="0 0 300 90"
          preserveAspectRatio="none"
          className="absolute bottom-0 left-1/2 z-10 h-[90px] w-[420px] -translate-x-1/2"
        >
          <defs>
            <linearGradient id="hero-funnel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#075056" />
              <stop offset="1" stopColor="#075056" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M146 0 L154 0 C154 30 175 60 300 90 L0 90 C125 60 146 30 146 0 Z" fill="url(#hero-funnel)" />
        </svg>
        <div className="absolute left-1/2 top-[142px] z-20 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-4 ring-background">
          <BarChart3 className="size-8" />
        </div>
        <p className="absolute bottom-1 right-[14%] text-xs text-muted-foreground">Sample insights, for illustration</p>
      </div>
    </div>
  );
}
