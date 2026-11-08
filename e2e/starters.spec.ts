import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test("a new account sees the getting-started card, and dismissing it sticks", async ({ page }) => {
  await signUp(page);
  const guide = page.getByTestId("getting-started");
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("Drop a file");
  await expect(guide).toContainText("Ask Pilot");
  await expect(guide).toContainText("Share a link");

  await guide.getByRole("button", { name: "Got it" }).click();
  await expect(guide).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: /Your projects/ })).toBeVisible();
  await expect(page.getByTestId("getting-started")).toHaveCount(0);
});

test("the guide can be brought back from the account menu", async ({ page }) => {
  const email = await signUp(page);
  await page.getByTestId("getting-started").getByRole("button", { name: "Dismiss the guide" }).click();
  await expect(page.getByTestId("getting-started")).toHaveCount(0);

  await page.getByRole("button", { name: new RegExp(email) }).click();
  await page.getByRole("menuitem", { name: "Show the guide again" }).click();
  await expect(page.getByTestId("getting-started")).toBeVisible();
});

test("the guide is remembered per account, not per browser", async ({ page }) => {
  await signUp(page);
  await page.getByTestId("getting-started").getByRole("button", { name: "Got it" }).click();
  // a different account in the same browser still gets its own first run
  await page.context().clearCookies();
  await signUp(page);
  await expect(page.getByTestId("getting-started")).toBeVisible();
});

test("an empty workspace offers the samples", async ({ page }) => {
  await signUp(page);
  await expect(page.getByText("No projects yet")).toBeVisible();
  await expect(page.getByTestId("starter")).toHaveCount(5);
  await expect(page.getByTestId("starter").first()).toContainText("rows");
});

test("a sample opens as a real project with a working dashboard", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: "Online store orders" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await expect(page.getByLabel("Project name")).toHaveValue("Online store orders");
  await expect(page.getByText("online-store-orders.csv").first()).toBeVisible();
  await expect(page.getByTestId("device-data")).toContainText("Kept on this device only");
  expect(await page.getByTestId("chart-card").count()).toBeGreaterThanOrEqual(3);

  // it is a normal project: it is listed, with its row count
  await page.goto("/app");
  const card = page.getByTestId("project-card").filter({ hasText: "Online store orders" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("rows");
  // and the samples are not offered again once there are projects
  await expect(page.getByTestId("starter")).toHaveCount(0);
});

test("every sample builds a dashboard", async ({ page }) => {
  await signUp(page);
  for (const title of ["Household spending", "Marketing performance", "Support tickets"]) {
    await page.goto("/app/new");
    await page.getByTestId("starter").filter({ hasText: title }).click();
    await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
    await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
    expect(await page.getByTestId("chart-card").count()).toBeGreaterThanOrEqual(2);
    // free up the slot so the next sample can be saved
    await page.goto("/app");
    const card = page.getByTestId("project-card").first();
    await card.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete project" }).click();
    await expect(page.getByTestId("project-card")).toHaveCount(0);
  }
});

test("every chart has a text description for screen readers, built from its own data", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: "Online store orders" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await expect(page.getByTestId("chart-card").first().locator("canvas")).toBeVisible();

  const charts = page.locator('[data-testid="chart-card"] [role="img"]');
  const count = await charts.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < count; i++) {
    const label = (await charts.nth(i).getAttribute("aria-label"))!;
    expect(label, label).toMatch(/^(Bar chart|Line chart|Area chart|Pie chart|Scatter plot|Map|Region map|Histogram|Heatmap): .+\./);
    expect(label, label).not.toMatch(/undefined|NaN|null/);
  }
  // the bar chart of revenue by region reads out the regions, biggest first
  const bar = page.getByRole("img", { name: /^Bar chart: revenue by region/ });
  await expect(bar).toBeVisible();
  expect(await bar.getAttribute("aria-label")).toMatch(/4 bars, highest first: South .* and /);
  // and the line says where it starts and ends
  await expect(page.getByRole("img", { name: /^Line chart: revenue over time/ })).toHaveAttribute("aria-label", /It starts at .* and ends (higher|lower)/);
});

test("a file with latitude and longitude opens with a map, and a published map holds only busy areas", async ({ page, browser }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: "Delivery drops" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });

  const map = page.getByRole("img", { name: /^Map: Where the rows are/ });
  await expect(map).toBeVisible();
  const own = (await map.getAttribute("aria-label"))!;
  const areasOwn = Number(own.match(/(\d+) areas? with rows/)![1]);
  expect(areasOwn).toBeGreaterThan(5);

  // the country column becomes a shaded map of the countries, drawn from shapes that are fetched once
  const regions = page.getByRole("img", { name: /^Region map: Average delivery_minutes by country/ });
  await expect(regions).toBeVisible({ timeout: 30_000 });
  expect(await regions.getAttribute("aria-label")).toMatch(/8 places shaded, highest first: .+\./);
  await expect(regions.locator("canvas")).toBeVisible();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create link" }).click();
  const link = dialog.getByTestId("share-link");
  await expect(link).toBeVisible({ timeout: 30_000 });
  const url = await link.inputValue();

  const stranger = await browser.newContext();
  const view = await stranger.newPage();
  await view.goto(url);
  const shared = view.getByRole("img", { name: /^Map: Where the rows are/ });
  await expect(shared).toBeVisible({ timeout: 30_000 });
  const label = (await shared.getAttribute("aria-label"))!;
  const areasShared = Number(label.match(/(\d+) areas? with rows/)![1]);
  // sparse bins are left out of what a stranger sees, so the published map has fewer areas than the owner's
  expect(areasShared).toBeLessThan(areasOwn);
  expect(areasShared).toBeGreaterThan(0);
  // a stranger sees the shaded countries too, from the published numbers and no data of their own
  await expect(view.getByRole("img", { name: /^Region map: Average delivery_minutes by country.*8 places shaded/ })).toBeVisible();
  await stranger.close();
});

test("a sample opens with a histogram of its main measure and a heatmap of two categories", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: "Online store orders" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });

  const histogram = page.getByRole("img", { name: /^Histogram: How revenue is spread out/ });
  await expect(histogram).toBeVisible();
  await expect(histogram).toHaveAttribute("aria-label", /20 bins from .+ to .+\. The most rows/);
  await expect(histogram.locator("canvas").first()).toBeVisible();

  const heatmap = page.getByRole("img", { name: /^Heatmap: revenue by region and category/ });
  await expect(heatmap).toBeVisible();
  await expect(heatmap).toHaveAttribute("aria-label", /\d+ combinations\. Highest: .+ and .+, .+\. Lowest:/);
  await expect(heatmap.locator("canvas").first()).toBeVisible();
});
