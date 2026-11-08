import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { signUp } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

const orders = (rows: number) => {
  const regions = ["North", "South", "East", "West"];
  let seed = 3;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  return "order_date,region,revenue\n" + Array.from({ length: rows }, (_, i) => `2024-0${1 + (i % 9)}-1${i % 9},${regions[i % 4]},${(10 + next() * 90).toFixed(2)}`).join("\n") + "\n";
};

async function rowsShown(page: Page) {
  const kpi = page.getByTestId("kpi").filter({ hasText: /^Rows/ }).getByTestId("kpi-value");
  await expect(kpi).not.toHaveText("", { timeout: 30_000 });
  return Number((await kpi.innerText()).replace(/,/g, ""));
}

test("pasted cells from a spreadsheet become a project", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByRole("tab", { name: "Paste" }).click();
  const box = page.getByLabel("Paste cells or a table");
  await expect(page.getByRole("button", { name: "Build dashboard" })).toBeDisabled();
  const cells = "region\trevenue\tday\n" + Array.from({ length: 40 }, (_, i) => `${["North", "South", "East"][i % 3]}\t${100 + i * 3}\t2024-02-${String(1 + (i % 27)).padStart(2, "0")}`).join("\n");
  await box.fill(cells);
  await page.getByRole("button", { name: "Build dashboard" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  expect(await rowsShown(page)).toBe(40);
  await expect(page.getByText("Pasted data.tsv").first()).toBeVisible();
});

test("a table copied from a web page keeps its cells", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByRole("tab", { name: "Paste" }).click();
  const box = page.getByLabel("Paste cells or a table");
  const rows = Array.from({ length: 12 }, (_, i) => [["Chad", "Peru", "Laos"][i % 3], String(1000 + i * 17)]);
  const html = `<table><thead><tr><th>Country</th><th>Visitors, 2024</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</tbody></table>`;
  // what a browser puts on the clipboard for a copied table: text and HTML. Text alone would run the cells together.
  const plain = "Country Visitors, 2024 " + rows.map((r) => r.join(" ")).join(" ");
  await box.evaluate((el, { html, plain }) => {
    const data = new DataTransfer();
    data.setData("text/html", html);
    data.setData("text/plain", plain);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, { html, plain });
  await box.fill(plain);
  await page.getByRole("button", { name: "Build dashboard" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  expect(await rowsShown(page)).toBe(12);
  await expect(page.getByText("Pasted table.csv").first()).toBeVisible();
});

test("something that is not a table says what to do", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByRole("tab", { name: "Paste" }).click();
  await page.getByLabel("Paste cells or a table").fill("just a sentence, nothing more");
  await page.getByRole("button", { name: "Build dashboard" }).click();
  await expect(page.locator('[data-slot="alert"]')).toContainText("does not look like a table");
  await expect(page).toHaveURL(/\/app\/new$/);
});

test.describe("from a link", () => {
  test.describe.configure({ mode: "serial" });
  let server: Server;
  let base: string;
  let size = 120;
  test.beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/sales.csv") res.writeHead(200, { "content-type": "text/csv", "content-disposition": 'attachment; filename="Regional sales.csv"' }).end(orders(size));
      else if (req.url === "/page") res.writeHead(200, { "content-type": "text/html" }).end("<html><body>Sign in to continue</body></html>");
      else res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  test.afterAll(() => server.close());

  test("a link to a CSV becomes a project, is fetched through the server, and can be refreshed when the data changes", async ({ page }) => {
    test.setTimeout(120_000);
    await signUp(page);
    await page.goto("/app/new");
    await page.getByRole("tab", { name: "Link" }).click();
    // what the person is told before they use it
    await expect(page.getByTestId("link-note")).toContainText("passed straight to your browser");
    await page.getByLabel("Start from a link").fill(`${base}/sales.csv`);
    await page.getByRole("button", { name: "Fetch and build" }).click();
    await expect(page).toHaveURL(/\/app\/p\//, { timeout: 60_000 });
    // the project takes its name from the file, and offers a refresh
    await expect(page.getByText("Regional sales.csv").first()).toBeVisible();
    expect(await rowsShown(page)).toBe(120);
    await expect(page.getByRole("button", { name: "Refresh from link" })).toBeVisible();

    // the data changes at the source; a refresh brings in the new rows
    size = 150;
    await page.getByRole("button", { name: "Refresh from link" }).click();
    await expect.poll(async () => Number((await page.getByTestId("kpi").filter({ hasText: /^Rows/ }).getByTestId("kpi-value").innerText()).replace(/,/g, "")), { timeout: 30_000 }).toBe(150);
    size = 120;

    // with no copy kept on this device, the project can fetch itself again instead of asking for the file
    await page.getByRole("button", { name: "Remove from this device" }).click();
    await page.reload();
    await expect(page.getByTestId("fetch-again")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("fetch-again").click();
    expect(await rowsShown(page)).toBe(120);
  });

  test("a link to a web page, or to nothing, says so in plain words", async ({ page }) => {
    await signUp(page);
    await page.goto("/app/new");
    await page.getByRole("tab", { name: "Link" }).click();
    await page.getByLabel("Start from a link").fill(`${base}/page`);
    await page.getByRole("button", { name: "Fetch and build" }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText("web page, not a data file");
    await page.getByLabel("Start from a link").fill(`${base}/missing.csv`);
    await page.getByRole("button", { name: "Fetch and build" }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText("Nothing was found");
    await expect(page).toHaveURL(/\/app\/new$/);
  });

  test("importing from a link needs to be signed in", async ({ request }) => {
    const res = await request.post("/api/import/fetch", { data: { url: `${base}/sales.csv` } });
    expect(res.status()).toBe(401);
  });
});

test("the new project page, with each way in, passes the accessibility checks", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  for (const tab of ["File", "Paste", "Link"]) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(400);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${tab}: ${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([]);
  }
});
