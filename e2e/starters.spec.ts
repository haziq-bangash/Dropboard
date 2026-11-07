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
  await expect(page.getByTestId("starter")).toHaveCount(4);
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
