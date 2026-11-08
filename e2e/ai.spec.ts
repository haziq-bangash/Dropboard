import { expect, test, type Page } from "@playwright/test";
import { heatmapChart, histogramChart } from "../packages/engine/src/suggest";
import path from "node:path";

const CSV = path.join(__dirname, "fixtures", "sales.csv");

async function signUp(page: Page) {
  const email = `e2e-ai-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  await page.goto("/login");
  await page.getByRole("button", { name: "No account? Sign up" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByText(email)).toBeVisible();
}

async function upload(page: Page) {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', CSV);
  await expect(page.getByTestId("kpi-value").first()).toHaveText("500", { timeout: 30_000 });
}

test("signed-out visitors are asked to sign in for Pilot", async ({ page }) => {
  await upload(page);
  await expect(page.getByText("to use Pilot")).toBeVisible();
  await expect(page.getByRole("button", { name: "Design with Pilot" })).toHaveCount(0);
});

test("Pilot reports clearly when the server has no model configured", async ({ page }) => {
  await signUp(page);
  await upload(page);
  await page.getByRole("button", { name: "Design with Pilot" }).click();
  await expect(page.locator('[data-slot="alert"]')).toContainText("Pilot is not available yet");
});

test("Pilot-designed dashboards replace the current one and drop charts that do not fit the data", async ({ page }) => {
  await signUp(page);
  await upload(page);

  // Stub the model: one good chart, one that references a column that does not exist
  await page.route("**/api/ai/generate", (route) =>
    route.fulfill({
      json: {
        cached: false,
        remaining: 7,
        dropped: [],
        spec: {
          version: 1,
          title: "Revenue by region",
          schema: [],
          charts: [
            { id: "c1", type: "kpi", title: "Total amount", query: 'SELECT sum("amount") AS value FROM data', layout: { x: 0, y: 0, w: 1, h: 1 } },
            { id: "c2", type: "kpi", title: "Bad column", query: 'SELECT sum("no_such_column") AS value FROM data', layout: { x: 0, y: 0, w: 1, h: 1 } },
            {
              id: "c3",
              type: "bar",
              title: "Amount by region",
              query: 'SELECT "region" AS x, sum("amount") AS y FROM data GROUP BY 1 ORDER BY 2 DESC',
              x: "x",
              y: ["y"],
              layout: { x: 0, y: 0, w: 1, h: 1 },
            },
          ],
        },
      },
    }),
  );

  await page.getByLabel("Dashboard instruction").fill("focus on revenue by region");
  await page.getByRole("button", { name: "Design with Pilot" }).click();

  await expect(page.getByRole("heading", { name: "Revenue by region", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Total amount")).toBeVisible();
  await expect(page.getByText("Amount by region")).toBeVisible();
  await expect(page.getByText("Bad column")).toHaveCount(0);
  await expect(page.getByText(/1 suggested chart did not fit your data/)).toBeVisible();
  await expect(page.getByText("7 requests left today.")).toBeVisible();
});

test("charts whose output columns are named differently are repaired and drawn, not shown blank", async ({ page }) => {
  await signUp(page);
  await upload(page);

  // A model can write good SQL and still name its columns its own way. The renderer reads `value` and `x` / `y`.
  await page.route("**/api/ai/generate", (route) =>
    route.fulfill({
      json: {
        cached: false,
        remaining: 5,
        dropped: [],
        spec: {
          version: 1,
          title: "Renamed columns",
          schema: [],
          charts: [
            { id: "c1", type: "kpi", title: "Headline amount", query: 'SELECT sum("amount") AS total_amount FROM data', layout: { x: 0, y: 0, w: 1, h: 1 } },
            {
              id: "c2",
              type: "bar",
              title: "Revenue per region",
              query: 'SELECT "region", sum("amount") AS revenue FROM data GROUP BY 1 ORDER BY 2 DESC',
              x: "x",
              y: ["y"],
              layout: { x: 0, y: 0, w: 1, h: 1 },
            },
            // nothing numeric to show as a headline number: cannot be repaired, so it is skipped
            { id: "c3", type: "kpi", title: "Only text", query: 'SELECT "region" FROM data LIMIT 1', layout: { x: 0, y: 0, w: 1, h: 1 } },
          ],
        },
      },
    }),
  );

  await page.getByLabel("Dashboard instruction").fill("anything");
  await page.getByRole("button", { name: "Design with Pilot" }).click();

  await expect(page.getByRole("heading", { name: "Renamed columns", exact: true })).toBeVisible({ timeout: 30_000 });
  // the headline number really shows the sum, not a blank
  await expect(page.getByTestId("kpi-value")).toHaveText("120,825", { timeout: 30_000 });
  // and the bar chart draws: its card is there with a canvas and no error
  const bar = page.getByTestId("chart-card").filter({ hasText: "Revenue per region" });
  await expect(bar.locator("canvas")).toBeVisible();
  await expect(bar.locator('[data-slot="alert"]')).toHaveCount(0);
  await expect(page.getByText("Only text")).toHaveCount(0);
  await expect(page.getByText(/1 suggested chart did not fit your data/)).toBeVisible();
});

test("asking a question runs the returned SQL in the browser and shows the answer", async ({ page }) => {
  await signUp(page);
  await upload(page);

  let sentBody = "";
  await page.route("**/api/ai/ask", (route) => {
    sentBody = route.request().postData() ?? "";
    return route.fulfill({
      json: {
        sql: 'SELECT "region", count(*) AS orders FROM data GROUP BY 1 ORDER BY 2 DESC',
        explanation: "Counts orders per region.",
        remaining: 5,
      },
    });
  });

  await page.getByLabel("Question about your data").fill("How many orders per region?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();

  await expect(page.getByText("Counts orders per region.")).toBeVisible({ timeout: 30_000 });
  const answer = page.getByTestId("ai-answer");
  await expect(answer.getByRole("columnheader", { name: "orders" })).toBeVisible();
  await expect(answer.getByRole("cell", { name: "North" })).toBeVisible();

  // Privacy: the request carries the schema and stats, but never row values
  const body = JSON.parse(sentBody) as { table: { columns: { name: string }[] }; question: string };
  expect(body.table.columns.map((c) => c.name)).toContain("region");
  expect(sentBody).not.toContain("2025-01-");
});

test("a failed question is repaired once, and the error sent back carries no data values", async ({ page }) => {
  await signUp(page);
  await upload(page);

  // the first query fails inside DuckDB with an error that quotes a real value from the data
  await page.route("**/api/ai/ask", (route) =>
    route.fulfill({ json: { sql: 'SELECT CAST("region" AS INTEGER) AS n FROM data', explanation: "Wrong.", remaining: 5 } }),
  );
  let repairBody = "";
  await page.route("**/api/ai/repair", (route) => {
    repairBody = route.request().postData() ?? "";
    return route.fulfill({
      json: { sql: 'SELECT "region", count(*) AS orders FROM data GROUP BY 1 ORDER BY 2 DESC', explanation: "Counts orders per region.", remaining: 4 },
    });
  });

  await page.getByLabel("Question about your data").fill("How many orders per region?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();

  await expect(page.getByText("Counts orders per region.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("first query failed, so it tried once more")).toBeVisible();
  await expect(page.getByText("4 requests left today")).toBeVisible();

  const body = JSON.parse(repairBody) as { error: string; sql: string };
  expect(body.error).toContain("Could not convert");
  for (const value of ["North", "South", "East", "West"]) expect(body.error).not.toContain(value);
});

test("when the repair fails too, the person sees the usual message", async ({ page }) => {
  await signUp(page);
  await upload(page);
  await page.route("**/api/ai/ask", (route) =>
    route.fulfill({ json: { sql: 'SELECT CAST("region" AS INTEGER) AS n FROM data', explanation: "Wrong.", remaining: 5 } }),
  );
  await page.route("**/api/ai/repair", (route) => route.fulfill({ status: 502, json: { error: "no" } }));
  await page.getByLabel("Question about your data").fill("How many orders per region?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator('[data-slot="alert"]')).toContainText("did not work on your data");
});

test("a histogram and a heatmap that Pilot names by column are drawn and described", async ({ page }) => {
  await signUp(page);
  await upload(page);

  // the server builds these queries from column names; here the stub returns what it would have built
  const histogram = histogramChart("amount");
  const heatmap = heatmapChart("region", "region");
  await page.route("**/api/ai/generate", (route) =>
    route.fulfill({
      json: {
        cached: false,
        remaining: 6,
        dropped: [],
        spec: {
          version: 1,
          title: "Shapes",
          schema: [],
          charts: [
            { id: "c1", type: "kpi", title: "Rows", query: "SELECT count(*) AS value FROM data", layout: { x: 0, y: 0, w: 1, h: 1 } },
            { id: "c2", ...histogram, title: "Spread of amount", layout: { x: 0, y: 0, w: 1, h: 1 } },
            { id: "c3", ...heatmap, title: "Region against itself", layout: { x: 0, y: 0, w: 1, h: 1 } },
          ],
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Design with Pilot" }).click();

  await expect(page.getByRole("heading", { name: "Shapes", exact: true })).toBeVisible({ timeout: 30_000 });
  const hist = page.getByRole("img", { name: /^Histogram: Spread of amount\. 20 bins from/ });
  await expect(hist).toBeVisible();
  await expect(hist.locator("canvas").first()).toBeVisible();
  await expect(page.getByRole("img", { name: /^Heatmap: Region against itself\. \d+ combinations/ })).toBeVisible();
  // nothing was dropped as unrunnable
  await expect(page.getByText(/did not fit your data/)).toHaveCount(0);
});
