import type { Role } from "@dropboard/engine";
import { range, seeded } from "../../../../packages/engine/test/random";

/**
 * A corpus of realistic tables, one for each kind of data people bring. Each says what its columns are, and the harness checks
 * that the system understands them and builds a sensible dashboard and findings from them. These are generated, with fixed
 * seeds, so a run is the same every time.
 */
export interface Dataset {
  id: string;
  title: string;
  csv: string;
  rows: number;
  /** What each named column should be understood as. Columns not listed are not checked. */
  roles: Record<string, Role>;
  /** The time column, if the table has one, and whether the table is one row per entity per period. */
  time?: string;
  panel?: { entity: string; time: string; repeated?: number };
  /** Charts that must be present, by type. */
  charts?: string[];
  /** Anomalies planted in the data: the kind of finding that must appear, and words its sentence must contain. Tables without this must produce none. */
  anomalies?: { kind: "unusualrows" | "contextual"; mentions: string }[];
  /** Findings that must appear, by kind, with words their sentence must contain. Tables that are not panels and list none must produce no concentration or standout. */
  insights?: { kind: string; mentions: string }[];
  /** Problems planted in the data: the issue codes of the data-quality findings that must appear. Tables without this must have none. */
  quality?: string[];
}

const csv = (header: string[], rows: (string | number | boolean | null)[][]) =>
  [header.join(","), ...rows.map((r) => r.map((v) => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(","))].join("\n") + "\n";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (n: number, from = Date.UTC(2023, 0, 1)) => new Date(from + n * 86_400_000);
const pick = <T>(r: ReturnType<typeof seeded>, items: readonly T[]) => items[r.int(0, items.length - 1)];

function finance(): Dataset {
  const r = seeded(1);
  const companies = [["AAPL", "IT"], ["MSFT", "IT"], ["XOM", "Energy"], ["JPM", "Bank"], ["WMT", "Retail"], ["PFE", "Pharma"], ["TSLA", "Auto"], ["KO", "Food"]];
  const rows: (string | number)[][] = [];
  for (const [i, [name, sector]] of companies.entries()) {
    let revenue = 40_000 + i * 15_000;
    for (let year = 2012; year <= 2023; year++) {
      revenue *= 1 + (r.normal() * 0.05 + 0.06 + (name === "TSLA" ? 0.2 : 0));
      const income = revenue * (0.1 + r.normal() * 0.02);
      rows.push([year, name, sector, Math.round(revenue), Math.round(income), Math.round(revenue * 6), +(0.1 + r.normal() * 0.03).toFixed(3) * 100, +(1 + r.normal() * 0.3).toFixed(2), Math.round(60_000 + i * 20_000 + year * 500), +(2 + r.normal()).toFixed(2)]);
    }
  }
  return {
    id: "finance-panel",
    title: "Company financials by year",
    csv: csv(["Year", "Company ", "Sector", "Revenue", "Net Income", "Market Cap(in B USD)", "ROE", "Debt/Equity Ratio", "Number of Employees", "Inflation Rate(in US)"], rows),
    rows: rows.length,
    roles: { Year: "time", Company: "category", Revenue: "flow", "Net Income": "flow", "Market Cap(in B USD)": "level", ROE: "rate", "Debt/Equity Ratio": "rate", "Number of Employees": "level", "Inflation Rate(in US)": "rate" },
    time: "Year",
    panel: { entity: "Company", time: "Year" },
    charts: ["line"],
  };
}

function retail(): Dataset {
  const r = seeded(2);
  const categories = ["Home", "Fitness", "Beauty", "Electronics", "Kitchen", "Outdoor"];
  const regions = ["North", "South", "East", "West"];
  const rows = range(2400).map((i) => {
    const quantity = r.int(1, 8);
    const price = +(5 + r.uniform() * 95).toFixed(2);
    return [1000 + i, iso(day(r.int(0, 360))), `C${String(r.int(1, 700)).padStart(4, "0")}`, `Product ${r.int(1, 40)}`, pick(r, categories), quantity, price, r.int(0, 30), pick(r, regions), +(quantity * price).toFixed(2)];
  });
  return {
    id: "retail-orders",
    title: "Store orders",
    csv: csv(["order_id", "order_date", "customer_id", "product", "category", "quantity", "unit_price", "discount_pct", "region", "revenue"], rows),
    rows: rows.length,
    roles: { order_id: "id", order_date: "time", customer_id: "id", quantity: "flow", unit_price: "rate", discount_pct: "rate", region: "category", revenue: "flow" },
    time: "order_date",
    charts: ["line", "bar"],
  };
}

function hr(): Dataset {
  const r = seeded(3);
  const departments = ["Engineering", "Sales", "Support", "Marketing", "Finance", "Legal", "Operations", "People"];
  const rows = range(600).map((i) => [`E-${String(i + 1).padStart(4, "0")}`, pick(r, departments), iso(day(-r.int(30, 3000))), Math.round(40_000 + r.uniform() * 90_000), r.int(1, 5), r.int(22, 62), r.uniform() < 0.3 ? "yes" : "no", `Manager ${r.int(1, 30)}`]);
  return {
    id: "hr-employees",
    title: "Employees",
    csv: csv(["employee_id", "department", "hire_date", "salary", "performance_score", "age", "remote", "manager"], rows),
    rows: rows.length,
    roles: { employee_id: "id", department: "category", hire_date: "time", salary: "rate", performance_score: "rate", age: "level", remote: "flag" },
    time: "hire_date",
  };
}

function saas(): Dataset {
  const r = seeded(4);
  const countries = ["United States", "Germany", "France", "India", "Brazil", "Japan", "Canada", "Spain", "Italy", "Mexico", "Australia", "Sweden", "Poland", "Kenya", "Singapore"];
  const rows = range(1500).map((i) => [`cus_${(i * 7919 + 13).toString(36)}`, pick(r, ["Free", "Pro", "Team"]), iso(day(r.int(0, 700))), +(r.uniform() * 300).toFixed(2), r.uniform() < 0.18, pick(r, countries)]);
  return {
    id: "saas-customers",
    title: "Subscriptions",
    csv: csv(["customer_id", "plan", "signup_date", "mrr", "churned", "country"], rows),
    rows: rows.length,
    roles: { customer_id: "id", plan: "category", signup_date: "time", churned: "flag", country: "category" },
    time: "signup_date",
    charts: ["line"],
  };
}

function web(): Dataset {
  const r = seeded(5);
  const pages = ["/", "/pricing", "/blog", "/docs", "/about", "/contact", "/signup", "/login", "/features", "/careers", "/status", "/changelog"];
  const rows: (string | number)[][] = [];
  for (let d = 0; d < 365; d++) for (const [p, page] of pages.entries()) rows.push([iso(day(d)), page, Math.round((200 + p * 80) * (1 + Math.sin(d / 58) * 0.2) * (0.8 + r.uniform() * 0.4)), +(0.3 + r.uniform() * 0.4).toFixed(3), r.int(40, 240)]);
  return {
    id: "web-analytics",
    title: "Page analytics",
    csv: csv(["date", "page", "sessions", "bounce_rate", "avg_session_seconds"], rows),
    rows: rows.length,
    roles: { date: "time", page: "category", sessions: "flow", bounce_rate: "rate", avg_session_seconds: "rate" },
    time: "date",
    panel: { entity: "page", time: "date" },
    charts: ["line"],
  };
}

function survey(): Dataset {
  const r = seeded(6);
  const words = ["great product", "too expensive", "support was slow", "love the new design", "would recommend", "needs more features", "easy to use", "confusing at first"];
  const rows = range(800).map((i) => [i + 1, pick(r, ["18-24", "25-34", "35-44", "45-54", "55+"]), pick(r, ["Female", "Male", "Other"]), r.int(1, 5), r.int(1, 5), r.int(1, 5), r.int(1, 5), r.int(0, 10), `${pick(r, words)}; ${pick(r, words)}; ${pick(r, words)}; ref ${r.int(1, 9999)}`]);
  return {
    id: "survey",
    title: "Customer survey",
    csv: csv(["respondent_id", "age_group", "gender", "q1_ease", "q2_speed", "q3_support", "q4_value", "likelihood_to_recommend", "comments"], rows),
    rows: rows.length,
    roles: { respondent_id: "id", age_group: "category", q1_ease: "rate", q3_support: "rate", likelihood_to_recommend: "rate", comments: "text" },
  };
}

function sensors(): Dataset {
  const r = seeded(7);
  const rows = range(24 * 90).map((h) => [new Date(Date.UTC(2023, 5, 1) + h * 3_600_000).toISOString().slice(0, 19).replace("T", " "), +(18 + 6 * Math.sin((h % 24) / 24 * Math.PI * 2 - 2) + r.normal()).toFixed(2), +(55 + 10 * Math.cos(h / 40) + r.normal() * 2).toFixed(1), +(1013 + r.normal() * 4).toFixed(1)]);
  return {
    id: "sensor-timeseries",
    title: "Sensor readings",
    csv: csv(["timestamp", "temperature_c", "humidity_pct", "pressure_hpa"], rows),
    rows: rows.length,
    roles: { timestamp: "time", temperature_c: "level", humidity_pct: "rate", pressure_hpa: "level" },
    time: "timestamp",
    charts: ["line"],
  };
}

function marketing(): Dataset {
  const r = seeded(8);
  const channels = ["Search", "Social", "Email", "Display", "Affiliate"];
  const rows: (string | number)[][] = [];
  for (let w = 0; w < 104; w++) for (const ch of channels) {
    const spend = Math.round(1000 + r.uniform() * 4000 + w * 15);
    const impressions = Math.round(spend * (30 + r.uniform() * 20));
    const clicks = Math.round(impressions * (0.01 + r.uniform() * 0.03));
    rows.push([iso(day(w * 7, Date.UTC(2022, 0, 3))), ch, spend, impressions, clicks, +(clicks / impressions).toFixed(4)]);
  }
  return {
    id: "marketing-weekly",
    title: "Weekly marketing",
    csv: csv(["week", "channel", "spend", "impressions", "clicks", "ctr"], rows),
    rows: rows.length,
    roles: { week: "time", channel: "category", spend: "flow", impressions: "flow", clicks: "flow", ctr: "rate" },
    time: "week",
    panel: { entity: "channel", time: "week" },
    charts: ["line"],
  };
}

function realEstate(): Dataset {
  const r = seeded(9);
  const cities = ["Austin", "Denver", "Seattle", "Boston", "Miami", "Phoenix", "Chicago", "Atlanta", "Portland", "Dallas"];
  const rows = range(1200).map((i) => {
    const sqft = Math.round(600 + r.uniform() * 3400);
    return [`L${100000 + i}`, pick(r, cities), Math.round(sqft * (150 + r.uniform() * 300)), sqft, r.int(1, 6), r.int(1950, 2022), +(30 + r.uniform() * 15).toFixed(4), +(-120 + r.uniform() * 40).toFixed(4)];
  });
  return {
    id: "real-estate",
    title: "Property listings",
    csv: csv(["listing_id", "city", "price", "sqft", "bedrooms", "year_built", "latitude", "longitude"], rows),
    rows: rows.length,
    roles: { listing_id: "id", city: "category", price: "rate", bedrooms: "rate", latitude: "latitude", longitude: "longitude", year_built: "time" },
    // the year a house was built is a way to group listings, and the table has no other time
    time: "year_built",
  };
}

function education(): Dataset {
  const r = seeded(10);
  const subjects = ["Math", "Science", "English", "History", "Art"];
  const rows: (string | number)[][] = [];
  for (let s = 1; s <= 150; s++) for (const year of [2021, 2022, 2023]) for (const subject of subjects) rows.push([`S${String(s).padStart(4, "0")}`, `Class ${((s - 1) % 6) + 1}`, subject, Math.round(Math.min(100, Math.max(20, 62 + r.normal() * 14 + (year - 2021) * 2))), year]);
  return {
    id: "education-grades",
    title: "Exam scores",
    csv: csv(["student_id", "class", "subject", "score", "year"], rows),
    rows: rows.length,
    roles: { student_id: "id", class: "category", subject: "category", score: "rate", year: "time" },
    time: "year",
  };
}

function healthcare(): Dataset {
  const r = seeded(11);
  const rows = range(1800).map((i) => [`P${String(r.int(1, 900)).padStart(5, "0")}`, iso(day(r.int(0, 540))), pick(r, ["Emergency", "Cardiology", "Orthopedics", "Pediatrics", "Radiology", "Oncology", "Neurology", "General"]), r.int(5, 180), Math.round(100 + r.uniform() * 4000), pick(r, ["Discharged", "Admitted", "Referred", "Follow-up"])]);
  return {
    id: "healthcare-visits",
    title: "Clinic visits",
    csv: csv(["patient_id", "visit_date", "department", "wait_minutes", "cost", "outcome"], rows),
    rows: rows.length,
    roles: { patient_id: "id", visit_date: "time", department: "category", wait_minutes: "rate", cost: "flow", outcome: "category" },
    time: "visit_date",
    charts: ["line"],
  };
}

function sports(): Dataset {
  const r = seeded(12);
  const teams = ["Hawks", "Lions", "Bears", "Wolves", "Eagles", "Tigers", "Sharks", "Comets", "Rockets", "Pirates"];
  const rows: (string | number)[][] = [];
  for (let p = 1; p <= 40; p++) for (let season = 2016; season <= 2023; season++) {
    const games = r.int(40, 82);
    rows.push([`Player ${p}`, teams[p % teams.length], season, games, Math.round(games * (6 + r.uniform() * 18)), Math.round(games * (1 + r.uniform() * 8))]);
  }
  return {
    id: "sports-stats",
    title: "Season stats",
    csv: csv(["player", "team", "season", "games", "points", "assists"], rows),
    rows: rows.length,
    roles: { player: "category", team: "category", season: "time", games: "flow", points: "flow", assists: "flow" },
    time: "season",
    panel: { entity: "player", time: "season" },
    charts: ["line"],
  };
}

/** Store orders where a handful of rows were keyed in wrongly: a quantity of 900 and a revenue to match. */
function retailWithErrors(): Dataset {
  const base = retail();
  const lines = base.csv.trimEnd().split("\n");
  // quantity is column 6 and revenue column 10 (1-based): inflate six rows spread through the table
  for (const at of [210, 640, 1120, 1500, 1890, 2250]) {
    const cells = lines[at].split(",");
    cells[5] = "900";
    cells[9] = String(Number(cells[6]) * 900);
    lines[at] = cells.join(",");
  }
  return {
    ...base,
    id: "retail-with-errors",
    title: "Store orders with keying errors",
    csv: lines.join("\n") + "\n",
    anomalies: [{ kind: "unusualrows", mentions: "unusually high" }],
  };
}

/** Monthly sales with a clear pattern, and one month that broke it. */
function monthlySales(): Dataset {
  const r = seeded(21);
  const rows = range(72).map((i) => {
    const month = i % 12;
    const base = 5000 * (1 + i * 0.01) * (month === 11 ? 1.6 : month === 6 ? 0.8 : 1) * (1 + r.normal() * 0.03);
    // month 40 (May of the fourth year): an outage, sales fall to a third
    return [iso(new Date(Date.UTC(2018, i, 1))), Math.round(i === 40 ? base * 0.33 : base), 200 + r.int(0, 30)];
  });
  return {
    id: "monthly-sales",
    title: "Monthly sales with one bad month",
    csv: csv(["month", "sales", "orders"], rows),
    rows: rows.length,
    roles: { month: "time", sales: "flow" },
    time: "month",
    charts: ["line"],
    anomalies: [{ kind: "contextual", mentions: "below what its trend and season predict" }],
  };
}

/** Orders exported from a messy system: spellings, placeholders, a text number column, wrong dates, and two months missing. */
function dirtyOrders(): Dataset {
  const r = seeded(31);
  const rows: (string | number)[][] = [];
  let id = 1;
  for (let d = 0; d < 1095; d++) {
    const date = new Date(Date.UTC(2021, 0, 1 + d));
    // February and March 2022 were never exported
    if (date.getUTCFullYear() === 2022 && (date.getUTCMonth() === 1 || date.getUTCMonth() === 2)) continue;
    for (let k = 0; k < 6; k++) {
      const status = pick(r, ["Shipped", "Shipped", "Shipped", "Pending", "Cancelled"]);
      const spelled = r.uniform() < 0.12 && status === "Shipped" ? "SHIPPED" : status;
      const revenue = r.uniform() < 0.05 ? "N/A" : String(Math.round((20 + r.uniform() * 400) * 100) / 100);
      const ship = r.uniform() < 0.02 ? "2099-01-01" : r.uniform() < 0.01 ? "1899-12-31" : iso(new Date(date.getTime() + 3 * 86_400_000));
      rows.push([id++, iso(date), spelled, revenue, ship, pick(r, ["North", "South", "East", "West"])]);
    }
  }
  return {
    id: "dirty-orders",
    title: "Orders from a messy export",
    csv: csv(["order_id", "order_date", "status", "revenue", "ship_date", "region"], rows),
    rows: rows.length,
    roles: { order_id: "id", order_date: "time", region: "category" },
    time: "order_date",
    quality: ["casevariants", "placeholder", "numberstext", "futuredates", "ancientdates", "gaps"],
  };
}

/** Companies by year where some company-years were entered twice. */
function dirtyPanel(): Dataset {
  const base = finance();
  const lines = base.csv.trimEnd().split("\n");
  // repeat six company-years, a few lines apart
  for (const at of [5, 20, 33, 47, 60, 75]) lines.push(lines[at]);
  return {
    ...base,
    id: "dirty-panel",
    panel: { entity: "Company", time: "Year", repeated: 6 },
    title: "Company financials with repeated rows",
    csv: lines.join("\n") + "\n",
    rows: lines.length - 1,
    quality: ["repeatedkeys"],
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Revenue by region and month, with the month written as text in the given way. */
function textPeriods(id: string, title: string, label: (year: number, month: number) => string, step = 1): Dataset {
  const r = seeded(41);
  const rows: (string | number)[][] = [];
  for (let year = 2021; year <= 2023; year++) for (let m = 0; m < 12; m += step) for (const region of ["North", "South", "East", "West", "Central"]) rows.push([label(year, m), region, Math.round(1000 * step * (1 + (year - 2021) * 0.2 + (m === 11 ? 0.5 : 0)) * (0.85 + r.uniform() * 0.3))]);
  return {
    id,
    title,
    csv: csv(["period", "region", "revenue"], rows),
    rows: rows.length,
    roles: { period: "time", region: "category", revenue: "flow" },
    time: "period",
    panel: { entity: "region", time: "period" },
    charts: ["line"],
  };
}

/** Orders where the month is only a name: it follows the calendar, not the size of the numbers. */
function cyclicMonths(): Dataset {
  const r = seeded(42);
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const rows = range(720).map(() => {
    const m = r.int(0, 11);
    return [names[m], pick(r, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]), pick(r, ["North", "South", "East"]), Math.round(100 + (m === 11 ? 200 : m === 2 ? -50 : 0) + r.uniform() * 80)];
  });
  return {
    id: "cyclic-months",
    title: "Sales by month name",
    csv: csv(["month", "weekday", "region", "sales"], rows),
    rows: rows.length,
    roles: { month: "category", weekday: "category", region: "category", sales: "flow" },
  };
}

/** Orders where ten of six hundred customers place most of the money, and one product sells several times what the rest do. */
function retailWhales(): Dataset {
  const r = seeded(51);
  const rows = range(3000).map((i) => {
    const whale = r.uniform() < 0.28;
    const customer = whale ? r.int(1, 10) : r.int(11, 600);
    const product = r.uniform() < 0.12 ? "Product 7" : `Product ${r.int(1, 40)}`;
    const amount = Math.round((whale ? 900 : 60) * (0.6 + r.uniform() * 0.8) * (product === "Product 7" ? 1.4 : 1));
    return [i + 1, iso(day(r.int(0, 360))), `C${String(customer).padStart(4, "0")}`, product, amount];
  });
  return {
    id: "retail-whales",
    title: "Orders with a few big customers",
    csv: csv(["order_id", "order_date", "customer_id", "product", "amount"], rows),
    rows: rows.length,
    roles: { order_id: "id", customer_id: "id", product: "category", amount: "flow" },
    time: "order_date",
    insights: [
      { kind: "pareto", mentions: "top 20% of customer_id" },
      { kind: "standout", mentions: "Product 7 has the highest total amount" },
    ],
  };
}

function tiny(): Dataset {
  return { id: "edge-tiny", title: "Five rows", csv: csv(["item", "qty", "note"], [["a", 1, "x"], ["b", 2, "y"], ["c", 3, "z"], ["d", 4, "w"], ["e", 5, "v"]]), rows: 5, roles: {} };
}

function oneColumn(): Dataset {
  return { id: "edge-one-column", title: "One column", csv: csv(["value"], range(60).map((i) => [(i * 37) % 101])), rows: 60, roles: {} };
}

function allText(): Dataset {
  const r = seeded(13);
  return { id: "edge-all-text", title: "Only text", csv: csv(["name", "team", "status"], range(80).map((i) => [`Person ${i}`, pick(r, ["A", "B", "C"]), pick(r, ["open", "closed", "pending", "blocked"])])), rows: 80, roles: { name: "id", team: "category" } };
}

function sparse(): Dataset {
  const r = seeded(14);
  return {
    id: "edge-sparse",
    title: "Mostly empty",
    csv: csv(["id", "a", "b", "c", "group"], range(200).map((i) => [i + 1, r.uniform() < 0.1 ? +(r.normal() * 10).toFixed(2) : null, r.uniform() < 0.05 ? r.int(1, 100) : null, null, pick(r, ["x", "y", "z"])])),
    rows: 200,
    roles: { id: "id", group: "category" },
  };
}

export const DATASETS: Dataset[] = [retailWhales(), textPeriods("text-months-iso", "Revenue with 2021-03 months", (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`), textPeriods("text-months-words", "Revenue with Mar 2021 months", (y, m) => `${MONTHS[m]} ${y}`), textPeriods("text-quarters", "Revenue with 2021-Q1 quarters", (y, m) => `${y}-Q${Math.floor(m / 3) + 1}`, 3), cyclicMonths(), finance(), retail(), retailWithErrors(), monthlySales(), dirtyOrders(), dirtyPanel(), hr(), saas(), web(), survey(), sensors(), marketing(), realEstate(), education(), healthcare(), sports(), tiny(), oneColumn(), allText(), sparse()];
