import { expect, test } from "@playwright/test";
import path from "node:path";
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
    expect(label, label).toMatch(/^(Bar chart|Line chart|Area chart|Pie chart|Scatter plot|Map|Region map|Histogram|Heatmap|Box plot|Calendar): .+\./);
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

test("a sample opens with a box plot of how its main measure varies by group, and it is described", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: "Online store orders" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  const box = page.getByRole("img", { name: /^Box plot: How revenue varies by region/ });
  await expect(box).toBeVisible();
  await expect(box).toHaveAttribute("aria-label", /4 groups\. Highest median: .+, middle half from .+ to .+\. Lowest median:/);
  await expect(box.locator("canvas").first()).toBeVisible();
});

test("a sample with many days opens with a calendar of its busy days", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: "Online store orders" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  const calendar = page.getByRole("img", { name: /^Calendar: Rows per day by order_date/ });
  await expect(calendar).toBeVisible();
  await expect(calendar).toHaveAttribute("aria-label", /\d+ days with rows, from 2025-\d\d-\d\d to 2025-\d\d-\d\d, .+ rows in all\. Busiest day/);
  await expect(calendar.locator("canvas").first()).toBeVisible();
});

test("the data preview is kept on a rich file, and a keyboard can reach it", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: "Online store orders" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  const preview = page.getByRole("region", { name: "Data preview, table that scrolls" });
  await expect(preview).toBeVisible();
  await preview.focus();
  await expect(preview).toBeFocused();
});

test("a dashboard fits a phone: nothing scrolls sideways and every chart is inside the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: "Delivery drops" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await expect(page.getByRole("img", { name: /^Region map/ })).toBeVisible({ timeout: 30_000 });
  for (const tab of ["Dashboard", "Insights", "Story"]) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(500);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide, `${tab} scrolls sideways by ${wide}px`).toBeLessThanOrEqual(0);
  }
  await page.getByRole("tab", { name: "Dashboard" }).click();
  const boxes = await page.locator('[data-testid="chart-card"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  expect(boxes.length).toBeGreaterThan(5);
  for (const b of boxes) {
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(391);
  }

  // present mode on a phone: the controls stay on screen and a chart still fits
  await page.getByRole("button", { name: "Present", exact: true }).click();
  const present = page.getByTestId("present");
  await expect(present).toBeVisible();
  await page.keyboard.press("ArrowRight");
  const next = present.getByRole("button", { name: "Next chart" });
  const nextBox = (await next.boundingBox())!;
  expect(nextBox.x + nextBox.width).toBeLessThanOrEqual(390);
  expect(nextBox.y + nextBox.height).toBeLessThanOrEqual(844);
  const slide = (await present.getByRole("img").first().boundingBox())!;
  expect(slide.x).toBeGreaterThanOrEqual(0);
  expect(slide.x + slide.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
});

test("a chart can be saved as a PNG image, on the owner's page and on a shared link", async ({ page, browser }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: "Online store orders" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await expect(page.getByRole("img", { name: /^Bar chart: revenue by region/ })).toBeVisible();

  const savePng = async (target: typeof page) => {
    const [download] = await Promise.all([target.waitForEvent("download"), target.getByRole("button", { name: "Save revenue by region as an image" }).click()]);
    expect(download.suggestedFilename()).toBe("revenue-by-region.png");
    const file = await download.path();
    const bytes = (await import("node:fs")).readFileSync(file!);
    // the PNG signature, and a picture with something in it
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.length).toBeGreaterThan(5_000);
  };
  await savePng(page);

  // the table of rows has nothing to save, and so does a number
  await expect(page.getByRole("button", { name: /Save Data preview/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create link" }).click();
  const url = await dialog.getByTestId("share-link").inputValue();
  const stranger = await browser.newContext();
  const view = await stranger.newPage();
  await view.goto(url);
  await expect(view.getByRole("img", { name: /^Bar chart: revenue by region/ })).toBeVisible({ timeout: 30_000 });
  await savePng(view);
  await stranger.close();
});

test("present mode walks through the charts full screen with the keyboard, on the owner's page and a shared link", async ({ page, browser }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: "Online store orders" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });

  const walk = async (target: typeof page) => {
    await target.getByRole("button", { name: "Present", exact: true }).click();
    const present = target.getByTestId("present");
    await expect(present).toBeVisible();
    const count = target.getByTestId("present-count");
    await expect(count).toHaveText(/^1 of \d+$/);
    const total = Number((await count.innerText()).match(/of (\d+)/)![1]);
    expect(total).toBeGreaterThan(5);
    // the first slide is the headline numbers
    await expect(present.getByTestId("kpi")).toHaveCount(3);
    await expect(present.getByRole("button", { name: "Previous chart" })).toHaveAttribute("aria-disabled", "true");

    await target.keyboard.press("ArrowRight");
    await expect(count).toHaveText(`2 of ${total}`);
    // a chart, drawn large
    const chart = present.getByRole("img").first();
    await expect(chart).toBeVisible();
    const box = (await chart.boundingBox())!;
    expect(box.height).toBeGreaterThan(380);
    expect(box.width).toBeGreaterThan(600);

    await target.keyboard.press("End");
    await expect(count).toHaveText(`${total} of ${total}`);
    await expect(present.getByRole("button", { name: "Next chart" })).toHaveAttribute("aria-disabled", "true");
    await target.keyboard.press("ArrowLeft");
    await expect(count).toHaveText(`${total - 1} of ${total}`);
    await target.keyboard.press("Home");
    await expect(count).toHaveText(`1 of ${total}`);
    // the table of rows is not a slide
    for (let i = 1; i < total; i++) {
      await target.keyboard.press("ArrowRight");
      await expect(present.getByRole("region", { name: /table that scrolls/ })).toHaveCount(0);
    }

    await target.keyboard.press("Escape");
    await expect(present).toHaveCount(0);
  };
  await walk(page);

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create link" }).click();
  const url = await dialog.getByTestId("share-link").inputValue();
  const stranger = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const view = await stranger.newPage();
  await view.goto(url);
  await expect(view.getByRole("img", { name: /^Bar chart: revenue by region/ })).toBeVisible({ timeout: 30_000 });
  await walk(view);
  await stranger.close();
});

test("a file with US states opens with a shaded map of the United States", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', path.join(__dirname, "fixtures", "us-states.csv"));
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  const map = page.getByRole("img", { name: /^Region map: sales by state/ });
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(map).toHaveAttribute("aria-label", /14 places shaded, highest first: .+\./);
  await expect(map.locator("canvas").first()).toBeVisible();
  // the shapes come from the states file, not the world file
  const loaded = await page.evaluate(() => performance.getEntriesByType("resource").map((r) => r.name).filter((n) => n.includes("/geo/")));
  expect(loaded.some((n) => n.endsWith("/geo/us-states.json"))).toBe(true);
  expect(loaded.some((n) => n.endsWith("/geo/world.json"))).toBe(false);
});

test("a column of cities opens with a bubble map, and the city list is fetched only when it is needed", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));
  const cities = ["London", "Paris", "Berlin", "Madrid", "Rome", "Toronto", "Sydney", "Mumbai", "Lagos", "Tokyo"];
  const rows = ["delivery_city,orders,note"];
  for (let i = 0; i < 200; i++) rows.push(`${i % 12 === 0 ? "Smallville" : cities[i % cities.length]},${5 + (i * 7) % 40},x`);
  // a file with no place-like column never loads the list
  await page.goto("/");
  await page.setInputFiles('input[type="file"]', path.join(__dirname, "fixtures", "sales.csv"));
  await expect(page.getByTestId("kpi-value").first()).toHaveText("500", { timeout: 30_000 });
  expect(requested.some((u) => u.includes("/geo/cities.json"))).toBe(false);

  await page.goto("/");
  await page.setInputFiles('input[type="file"]', { name: "deliveries.csv", mimeType: "text/csv", buffer: Buffer.from(rows.join("\n") + "\n") });
  const map = page.getByRole("img", { name: /^City map: orders by delivery_city/ });
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(map).toHaveAttribute("aria-label", /10 cities drawn, biggest first: .+\. 1 other value is not a known city and is not shown\./);
  await expect(map.locator("canvas").first()).toBeVisible();
  expect(requested.some((u) => u.includes("/geo/cities.json"))).toBe(true);
});
