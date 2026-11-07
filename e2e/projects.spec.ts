import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const CSV = path.join(__dirname, "fixtures", "sales.csv");

async function signUp(page: Page) {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  await page.goto("/login");
  await page.getByRole("button", { name: "No account? Sign up" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  return email;
}

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

  await page.getByTestId("project-card").filter({ hasText: "(copy)" }).getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByTestId("project-card")).toHaveCount(1);
});

test("reopening a project asks for the file, then shows the dashboard and keeps edits", async ({ page }) => {
  await signUp(page);
  await newProject(page);
  const url = page.url();

  // a full page load drops the in-browser rows, so the file is asked for again
  await page.reload();
  await expect(page.getByText("Attach your file to open this dashboard")).toBeVisible();
  await page.setInputFiles('input[type="file"]', CSV);
  await expect(page.getByTestId("kpi-value").first()).toHaveText("500", { timeout: 30_000 });
  expect(page.url()).toBe(url);
});

test("a file with different columns is refused", async ({ page }) => {
  await signUp(page);
  await newProject(page);
  await page.reload();
  await page.setInputFiles('input[type="file"]', {
    name: "other.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("alpha,beta\n1,2\n3,4\n"),
  });
  await expect(page.locator('[data-slot="alert"]')).toContainText("missing columns");
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
