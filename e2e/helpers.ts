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
