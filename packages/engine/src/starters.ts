/**
 * Sample datasets that open as real projects. They are generated on the spot from a fixed seed, so every visitor gets the
 * same file, nothing is stored or downloaded, and the numbers are made up (never real people or companies).
 *
 * Column order matters a little: the dashboard suggester treats the first numeric column as the main measure.
 */
export interface Starter {
  id: string;
  title: string;
  description: string;
  fileName: string;
  /** What the sample is good for showing, one short line. */
  shows: string;
  rows: number;
  csv: () => string;
}

/** Small seeded random numbers (mulberry32), so a sample never changes between visits. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (lo: number, hi: number) => lo + (hi - lo) * next();
  const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
  const pick = <T>(items: readonly T[]) => items[int(0, items.length - 1)];
  /** Pick by weight: heavier entries come up more often. */
  const weighted = <T>(items: readonly (readonly [T, number])[]) => {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = next() * total;
    for (const [item, w] of items) if ((r -= w) <= 0) return item;
    return items[items.length - 1][0];
  };
  return { next, between, int, pick, weighted };
}

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

function toCsv(header: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => (typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));
  return [header.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n") + "\n";
}

function ecommerceOrders() {
  const r = rng(11);
  const regions = [["North", 3], ["South", 4], ["East", 3], ["West", 2]] as const;
  const categories = [["Home", 4], ["Fitness", 3], ["Beauty", 3], ["Electronics", 2], ["Kitchen", 3], ["Outdoor", 2]] as const;
  const price: Record<string, [number, number]> = { Home: [18, 90], Fitness: [12, 70], Beauty: [8, 45], Electronics: [30, 260], Kitchen: [10, 80], Outdoor: [22, 140] };
  const channels = [["Web", 5], ["App", 3], ["Marketplace", 3], ["Store", 1]] as const;
  // busier in the run-up to the holidays and a little on weekends
  const season = [0.8, 0.75, 0.85, 0.9, 0.95, 0.9, 0.85, 0.9, 1, 1.05, 1.5, 1.7];
  const rows: (string | number)[][] = [];
  const start = day(2025, 0, 1);
  for (let d = 0; d < 365; d++) {
    const date = addDays(start, d);
    const weekend = [0, 6].includes(date.getUTCDay()) ? 1.2 : 1;
    const count = Math.round(1.9 * season[date.getUTCMonth()] * weekend + r.next() * 1.4);
    for (let i = 0; i < count; i++) {
      const category = r.weighted(categories);
      const [lo, hi] = price[category];
      const quantity = r.weighted([[1, 6], [2, 3], [3, 1]] as const);
      const discount = r.weighted([[0, 6], [5, 2], [10, 2], [20, 1]] as const);
      const revenue = round(quantity * r.between(lo, hi) * (1 - discount / 100));
      rows.push([iso(date), 1000 + rows.length, r.weighted(regions), category, r.weighted(channels), revenue, quantity, discount]);
    }
  }
  return toCsv(["order_date", "order_id", "region", "category", "channel", "revenue", "quantity", "discount_pct"], rows);
}

function householdSpending() {
  const r = rng(23);
  const accounts = ["Current", "Credit card", "Cash"] as const;
  const monthly: [string, number, number, "Yes" | "No"][] = [
    ["Rent", 1150, 1, "Yes"],
    ["Utilities", 140, 5, "Yes"],
    ["Insurance", 88, 12, "Yes"],
    ["Subscriptions", 36, 18, "No"],
  ];
  const everyday = [["Groceries", 5, 24, 78, "Yes"], ["Transport", 4, 3, 38, "Yes"], ["Dining out", 3, 14, 70, "No"], ["Health", 1, 12, 90, "Yes"], ["Entertainment", 2, 9, 60, "No"], ["Clothing", 1, 20, 110, "No"]] as const;
  const rows: (string | number)[][] = [];
  for (let m = 0; m < 12; m++) {
    for (const [category, amount, dom, essential] of monthly) {
      rows.push([iso(day(2025, m, dom)), category, "Current", round(amount * r.between(0.97, 1.04)), essential]);
    }
    for (const [category, perMonth, lo, hi, essential] of everyday) {
      const n = Math.max(1, Math.round(perMonth * r.between(0.8, 1.3) * (m === 11 ? 1.4 : 1)));
      for (let i = 0; i < n; i++) {
        rows.push([iso(day(2025, m, r.int(1, 28))), category, r.pick(accounts), round(r.between(lo, hi)), essential]);
      }
    }
  }
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return toCsv(["date", "category", "account", "amount", "essential"], rows);
}

function marketingPerformance() {
  const r = rng(37);
  // channel: [objective, weekly spend, cost per click, click-to-conversion rate, revenue per conversion]
  const channels: [string, string, number, number, number, number][] = [
    ["Search", "Acquisition", 2400, 1.1, 0.045, 62],
    ["Social", "Awareness", 1800, 0.65, 0.022, 48],
    ["Email", "Retention", 600, 0.18, 0.06, 55],
    ["Display", "Awareness", 1200, 0.4, 0.012, 40],
    ["Affiliates", "Acquisition", 900, 0.8, 0.035, 58],
  ];
  const rows: (string | number)[][] = [];
  const start = day(2025, 0, 6); // a Monday
  for (let w = 0; w < 52; w++) {
    const week = addDays(start, w * 7);
    const lift = 1 + 0.25 * Math.sin((w / 52) * Math.PI * 2 - 1) + (w > 43 ? 0.25 : 0);
    for (const [channel, objective, base, cpc, rate, perConversion] of channels) {
      const spend = round(base * lift * r.between(0.85, 1.15));
      const clicks = Math.round((spend / cpc) * r.between(0.9, 1.1));
      const conversions = Math.round(clicks * rate * r.between(0.8, 1.2));
      rows.push([iso(week), channel, objective, spend, round(conversions * perConversion * r.between(0.9, 1.1)), clicks, Math.round(clicks * r.between(18, 40)), conversions]);
    }
  }
  return toCsv(["week_start", "channel", "objective", "spend", "revenue", "clicks", "impressions", "conversions"], rows);
}

function supportTickets() {
  const r = rng(53);
  const priorities = [["Low", 4], ["Normal", 8], ["High", 3], ["Urgent", 1]] as const;
  const channels = [["Email", 6], ["Chat", 5], ["Phone", 2], ["Web form", 3]] as const;
  const categories = [["Billing", 4], ["Login", 3], ["Bug", 4], ["How do I", 5], ["Feature request", 2], ["Delivery", 3]] as const;
  const hours: Record<string, number> = { Low: 30, Normal: 16, High: 7, Urgent: 3 };
  const rows: (string | number)[][] = [];
  const start = day(2025, 0, 1);
  for (let d = 0; d < 365; d++) {
    const date = addDays(start, d);
    if ([0, 6].includes(date.getUTCDay()) && r.next() < 0.6) continue;
    const count = r.int(0, 3) + (d > 300 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const priority = r.weighted(priorities);
      const resolution = round(Math.max(0.2, hours[priority] * r.between(0.3, 1.8)), 1);
      const satisfaction = Math.max(1, Math.min(5, Math.round(5.3 - resolution / 14 + r.between(-1.2, 1))));
      rows.push([iso(date), resolution, r.int(2, priority === "Urgent" ? 20 : 180), satisfaction, priority, r.weighted(channels), r.weighted(categories)]);
    }
  }
  return toCsv(["created_date", "resolution_hours", "first_response_minutes", "satisfaction", "priority", "channel", "category"], rows);
}

const count = (csv: () => string) => csv().trimEnd().split("\n").length - 1;

export const STARTERS: Starter[] = [
  {
    id: "ecommerce-orders",
    title: "Online store orders",
    description: "A year of orders across regions, categories and sales channels.",
    fileName: "online-store-orders.csv",
    shows: "Revenue over time, best categories, channel mix",
    csv: ecommerceOrders,
    rows: count(ecommerceOrders),
  },
  {
    id: "household-spending",
    title: "Household spending",
    description: "A year of bills and everyday spending on a few accounts.",
    fileName: "household-spending.csv",
    shows: "Where the money goes, essentials versus extras",
    csv: householdSpending,
    rows: count(householdSpending),
  },
  {
    id: "marketing-performance",
    title: "Marketing performance",
    description: "Weekly spend, clicks and revenue for five channels.",
    fileName: "marketing-performance.csv",
    shows: "Spend against revenue, which channels pay back",
    csv: marketingPerformance,
    rows: count(marketingPerformance),
  },
  {
    id: "support-tickets",
    title: "Support tickets",
    description: "A year of tickets with priority, response times and satisfaction.",
    fileName: "support-tickets.csv",
    shows: "Response and resolution times, what drives satisfaction",
    csv: supportTickets,
    rows: count(supportTickets),
  },
];
