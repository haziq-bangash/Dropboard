import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { signUp } from "./helpers";

const CSV = path.join(__dirname, "fixtures", "sales.csv");

async function newProject(page: Page) {
  await page.goto("/app/new");
  await page.setInputFiles('input[type="file"]', CSV);
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).toHaveText("500", { timeout: 30_000 });
}

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});

test("signing up lands in the workspace, which starts empty", async ({ page }) => {
  await signUp(page);
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: /Your projects/ })).toBeVisible();
  await expect(page.getByText("No projects yet")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Projects" })).toHaveAttribute("aria-valuenow", "0");
});

test("a dropped file becomes a saved project that is listed, renamed, duplicated and deleted", async ({ page }) => {
  await signUp(page);
  await newProject(page);

  // rename on the project page
  const name = page.getByLabel("Project name");
  await name.fill("Q4 sales");
  await name.press("Enter");
  await expect(page.getByText("sales.csv").first()).toBeVisible();

  await page.getByRole("link", { name: "Projects", exact: true }).first().click();
  const card = page.getByTestId("project-card").filter({ hasText: "Q4 sales" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("500 rows");

  await card.getByRole("button", { name: /Actions for Q4 sales/ }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByTestId("project-card")).toHaveCount(2);
  await expect(page.getByText("Q4 sales (copy)")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Projects" })).toHaveAttribute("aria-valuenow", "2");

  // the menu used for duplicating must be gone before the next one opens, or both offer a Delete
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByTestId("project-card").filter({ hasText: "(copy)" }).getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByTestId("project-card")).toHaveCount(1);
});

test("reopening a project shows the dashboard without asking for the file again", async ({ page }) => {
  await signUp(page);
  await newProject(page);
  const url = page.url();

  // a full page load drops the in-browser rows, so they come back from the copy kept on this device
  await page.reload();
  await expect(page.getByTestId("kpi-value").first()).toHaveText("500", { timeout: 30_000 });
  await expect(page.getByTestId("device-data")).toContainText("Kept on this device only");
  expect(page.url()).toBe(url);
});

test("removing the copy from this device brings back the attach step", async ({ page }) => {
  await signUp(page);
  await newProject(page);
  await expect(page.getByTestId("device-data")).toContainText("Kept on this device only");

  await page.getByRole("button", { name: "Remove from this device" }).click();
  await expect(page.getByText("Attach your file to open this dashboard")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Attach your file to open this dashboard")).toBeVisible();
  await page.setInputFiles('input[type="file"]', CSV);
  await expect(page.getByTestId("kpi-value").first()).toHaveText("500", { timeout: 30_000 });
  await expect(page.getByTestId("device-data")).toContainText("Kept on this device only");
});

test("a file with different columns is refused", async ({ page }) => {
  await signUp(page);
  await newProject(page);
  await page.getByRole("button", { name: "Remove from this device" }).click();
  await expect(page.getByText("Attach your file to open this dashboard")).toBeVisible();
  await page.reload();
  await page.setInputFiles('input[type="file"]', {
    name: "other.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("alpha,beta\n1,2\n3,4\n"),
  });
  await expect(page.locator('[data-slot="alert"]')).toContainText("missing columns");
  await expect(page.getByText("Attach your file to open this dashboard")).toBeVisible();
});

test("replacing the file on an open project checks its columns too", async ({ page }) => {
  await signUp(page);
  await newProject(page);
  await page.locator('[data-testid="device-data"] input[type="file"]').setInputFiles({
    name: "other.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("alpha,beta\n1,2\n"),
  });
  await expect(page.locator('[data-slot="alert"]')).toContainText("missing columns");
  // the dashboard is still there
  await expect(page.getByTestId("kpi-value").first()).toHaveText("500");
});

test("signing out wipes the copies kept on this device", async ({ page }) => {
  const email = await signUp(page);
  await newProject(page);
  await page.goto("/app");
  await page.getByRole("button", { name: new RegExp(email) }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByTestId("project-card").first().click();
  await expect(page.getByText("Attach your file to open this dashboard")).toBeVisible();
});

test("publishing from a project lists the link, and turning it off frees the slot", async ({ page }) => {
  await signUp(page);
  await newProject(page);

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create link" }).click();
  await expect(dialog.getByTestId("share-link")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");

  await expect(page.getByTestId("published-link")).toHaveCount(1);
  await expect(page.getByRole("progressbar", { name: "Published links" })).toHaveAttribute("aria-valuenow", "1");

  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByTestId("published-link")).toHaveCount(0);
  await expect(page.getByRole("progressbar", { name: "Published links" })).toHaveAttribute("aria-valuenow", "0");
});

test("the free plan stops at three projects", async ({ page }) => {
  await signUp(page);
  for (let i = 0; i < 3; i++) await newProject(page);
  await page.goto("/app");
  await expect(page.getByTestId("project-card")).toHaveCount(3);
  await expect(page.getByText("You are using all 3 projects")).toBeVisible();
  await expect(page.getByRole("link", { name: "New project" }).first()).toBeVisible();

  // going straight to the new project page and dropping a fourth file is refused with a clear message
  await page.goto("/app/new");
  await page.setInputFiles('input[type="file"]', CSV);
  await expect(page.locator('[data-slot="alert"]')).toContainText("allows 3 saved projects", { timeout: 30_000 });
});

test("a column the detector missed can be mapped by hand, and a chart can be removed", async ({ page }) => {
  await signUp(page);
  // 70% of the "area" values are US states, below the share automatic detection needs, so no map is drawn on its own
  await page.goto("/app/new");
  await page.setInputFiles('input[type="file"]', path.join(__dirname, "fixtures", "mixed-areas.csv"));
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
  await expect(page.getByRole("img", { name: /^Region map/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Map a column" }).click();
  const states = page.getByRole("group").filter({ hasText: "Column of US states" });
  await states.getByRole("menuitem", { name: "area" }).click();
  const map = page.getByRole("img", { name: /^Region map/ });
  await expect(map).toBeVisible({ timeout: 30_000 });
  await expect(map).toHaveAttribute("aria-label", /6 places shaded.* 3 other values do not match a state/);

  // asking for the same map again says so instead of adding a second one
  await page.getByRole("button", { name: "Map a column" }).click();
  await page.getByRole("group").filter({ hasText: "Column of US states" }).getByRole("menuitem", { name: "area" }).click();
  await expect(page.getByRole("status")).toContainText("already mapped");

  // the map comes off with the chart's remove button
  const before = await page.getByTestId("chart-card").count();
  await page.getByTestId("chart-card").filter({ has: map }).getByRole("button", { name: /^Remove .* from the dashboard$/ }).click();
  await expect(page.getByTestId("chart-card")).toHaveCount(before - 1);
  await expect(page.getByRole("img", { name: /^Region map/ })).toHaveCount(0);
});

test("a treemap, a funnel and a flow diagram can be added by choosing columns, and each is described", async ({ page }) => {
  await signUp(page);
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: "Online store orders" }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });

  const add = async (item: string) => {
    await page.getByRole("button", { name: "Add a chart" }).click();
    await page.getByRole("menuitem", { name: item }).click();
  };
  const dialog = page.getByRole("dialog");

  await add("Treemap");
  await dialog.getByLabel("Groups", { exact: true }).selectOption("region");
  await dialog.getByLabel("Split each group by").selectOption("category");
  await dialog.getByLabel("Sized by").selectOption("revenue");
  await page.getByRole("button", { name: "Add chart" }).click();
  await expect(page.getByRole("img", { name: /^Treemap: revenue by region and category\. 4 groups, largest first: .+ Split into 24 parts/ })).toBeVisible({ timeout: 30_000 });

  await add("Funnel");
  await dialog.getByLabel("Stages", { exact: true }).selectOption("channel");
  await page.getByRole("button", { name: "Add chart" }).click();
  await expect(page.getByRole("img", { name: /^Funnel: Rows by channel\. 4 stages, widest first\./ })).toBeVisible({ timeout: 30_000 });

  await add("Flow diagram");
  await dialog.getByLabel("Starts in").selectOption("region");
  await dialog.getByLabel("Ends in").selectOption("channel");
  await dialog.getByLabel("Sized by").selectOption("revenue");
  await page.getByRole("button", { name: "Add chart" }).click();
  await expect(page.getByRole("img", { name: /^Flow diagram: revenue from region to channel\. 16 flows from 4 starts to 4 ends\./ })).toBeVisible({ timeout: 30_000 });

  // adding the same funnel again says so
  await add("Funnel");
  await dialog.getByLabel("Stages", { exact: true }).selectOption("channel");
  await page.getByRole("button", { name: "Add chart" }).click();
  await expect(page.getByRole("alert")).toContainText("already on this dashboard");
});
