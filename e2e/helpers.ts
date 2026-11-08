import { expect, type Page } from "@playwright/test";

/** Create a fresh account through the sign-up form and land in the workspace. Returns the email used. */
export async function signUp(page: Page) {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  await page.goto("/login");
  await page.getByRole("button", { name: "No account? Sign up" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  return email;
}

/** Ten companies over ten years, each with its own story: Alpha climbs fast, Flint falls, Jade is far bigger than the rest. */
export function companiesByYear(): string {
  const rows = ["Year,Company,Sector,Revenue,Net Income,ROE,Number of Employees"];
  const names = ["Alpha", "Bravo", "Cedar", "Delta", "Ember", "Flint", "Grove", "Harbor", "Iris", "Jade"];
  const growth: Record<string, number> = { Alpha: 0.28, Flint: -0.13 };
  names.forEach((name, i) => {
    let revenue = name === "Jade" ? 30_000 : 1000 + i * 150;
    for (let year = 2014; year <= 2023; year++) {
      revenue *= 1 + (growth[name] ?? 0.03 + (((i * 7 + year) % 5) - 2) * 0.01);
      rows.push(`${year},${name},${i < 5 ? "Tech" : "Retail"},${Math.round(revenue)},${Math.round(revenue * 0.1)},${(8 + ((i + year) % 7)).toFixed(1)},${2000 + i * 300 + (year - 2014) * 40}`);
    }
  });
  return rows.join("\n") + "\n";
}

/** Four hundred orders, six of them keyed in wrongly (a quantity of 900 and an amount to match). */
export function ordersWithErrors(): string {
  let seed = 11;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const rows = ["order_id,day,quantity,unit_price,amount,discount_pct,region"];
  for (let i = 1; i <= 400; i++) {
    const wrong = [40, 120, 200, 260, 310, 370].includes(i);
    const quantity = wrong ? 900 : 1 + Math.floor(rnd() * 8);
    const price = Math.round((5 + rnd() * 95) * 100) / 100;
    rows.push([i, `2023-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, quantity, price, Math.round(quantity * price * 100) / 100, Math.floor(rnd() * 30), ["North", "South", "East", "West"][i % 4]].join(","));
  }
  return rows.join("\n") + "\n";
}

/** An export with problems in it: one value written two ways, a placeholder for missing, and a column of numbers with a few "N/A". */
export function messyExport(): string {
  const rows = ["order_id,status,revenue,region"];
  for (let i = 1; i <= 240; i++) {
    const status = i % 9 === 0 ? "SHIPPED" : i % 5 === 0 ? "Pending" : "Shipped";
    const revenue = i % 17 === 0 ? "N/A" : String(20 + ((i * 37) % 380));
    rows.push([i, status, revenue, ["North", "South", "East", "West"][i % 4]].join(","));
  }
  return rows.join("\n") + "\n";
}
