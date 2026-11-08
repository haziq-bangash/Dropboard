import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * Automated accessibility checks (axe, WCAG 2.0 and 2.1 A and AA) on the pages people actually use. They catch the
 * mechanical problems: missing names and labels, contrast, landmarks, heading order. They do not replace using the
 * product with a keyboard or a screen reader, but they stop the regressions that are easy to introduce.
 */
// Entrance animations fade things in, and axe would measure the colours halfway through the fade. People who ask for
// reduced motion get the final state straight away, so that is the state worth checking.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function violations(page: Page, exclude: string[] = []) {
  // dialogs and menus animate in even with reduced motion; measure them once they have settled
  await page.waitForTimeout(500);
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  for (const selector of exclude) builder = builder.exclude(selector);
  const results = await builder.analyze();
  return results.violations.map((v) => {
    const first = v.nodes[0];
    return `${v.id} (${v.impact}, ${v.nodes.length} element${v.nodes.length === 1 ? "" : "s"}): ${v.help}\n    e.g. ${first?.target.join(" ")}\n    ${first?.html.slice(0, 160)}`;
  });
}

const expectClean = async (page: Page, where: string, exclude: string[] = []) => {
  const found = await violations(page, exclude);
  expect(found, `${where} has accessibility problems:\n${found.join("\n")}`).toEqual([]);
};

/** WCAG contrast ratio between two CSS colours given as "rgb(r, g, b)". */
const contrast = (a: string, b: string) => {
  const lum = (css: string) => {
    const [r, g, bl] = (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

async function sampleProject(page: Page, title = "Support tickets") {
  await page.goto("/app/new");
  await page.getByTestId("starter").filter({ hasText: title }).click();
  await expect(page).toHaveURL(/\/app\/p\//, { timeout: 30_000 });
  await expect(page.getByTestId("kpi-value").first()).not.toHaveText("", { timeout: 30_000 });
}

test.describe("public pages", () => {
  test("landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // sections fade in as they scroll into view: go to the bottom and back so every one is in its final state
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 80));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);
    // One tilted chip in a card that clips its contents (isolation plus overflow hidden) is measured wrongly by axe, which
    // reads the card's pale background instead of the chip's own dark green. Removing either property makes axe agree
    // with the eye, so the chip is left out of the scan and measured directly in the next test.
    await expectClean(page, "the landing page", ['[data-testid="perk"] span.bg-primary']);
  });

  test("the tilted file-type chip has readable text, measured from its real colours", async ({ page }) => {
    await page.goto("/");
    const chip = page.locator('[data-testid="perk"] span.bg-primary', { hasText: ".csv" });
    await chip.scrollIntoViewIfNeeded();
    const { color, background } = await chip.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, background: s.backgroundColor };
    });
    expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5);
  });

  test("sign in and sign up", async ({ page }) => {
    await page.goto("/login");
    await expectClean(page, "the sign-in form");
    await page.getByRole("button", { name: "No account? Sign up" }).click();
    await expectClean(page, "the sign-up form");
    await page.getByRole("button", { name: "Have an account? Sign in" }).click();
  });

  test("password reset", async ({ page }) => {
    await page.goto("/reset-password?token=anything");
    await expect(page.getByLabel("New password")).toBeVisible();
    await expectClean(page, "the reset form");
    await page.goto("/reset-password");
    await expectClean(page, "the expired-link message");
  });

  test("a published dashboard", async ({ page }) => {
    await signUp(page);
    await sampleProject(page);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expectClean(page, "the publish dialog");
    await dialog.getByRole("button", { name: "Create link" }).click();
    const link = await dialog.getByTestId("share-link").inputValue();
    await page.keyboard.press("Escape");

    const viewer = await page.context().newPage();
    await viewer.goto(link);
    await expect(viewer.getByTestId("kpi-value").first()).toBeVisible({ timeout: 30_000 });
    await expectClean(viewer, "a published dashboard");
  });
});

test.describe("signed in", () => {
  test("projects, new project and account", async ({ page }) => {
    await signUp(page);
    await expect(page.getByRole("heading", { name: /Your projects/ })).toBeVisible();
    await expectClean(page, "the empty projects page with the guide and samples");

    await page.goto("/app/new");
    await expect(page.getByRole("heading", { name: /New project/ })).toBeVisible();
    await expectClean(page, "the new project page");

    await page.goto("/app/account");
    await expect(page.getByRole("heading", { name: /Your account/ })).toBeVisible();
    await expectClean(page, "the account page");
  });

  test("the user menu and the delete-account dialog", async ({ page }) => {
    const email = await signUp(page);
    await page.getByRole("button", { name: new RegExp(email) }).click();
    await expect(page.getByRole("menuitem", { name: "Account" })).toBeVisible();
    await expectClean(page, "the open user menu");
    await page.keyboard.press("Escape");

    await page.goto("/app/account");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectClean(page, "the delete-account dialog");
  });

  test("a project's dashboard, insights, story and a project card menu", async ({ page }) => {
    await signUp(page);
    await sampleProject(page);
    await expectClean(page, "the project dashboard");

    await page.getByRole("tab", { name: "Insights" }).click();
    await expect(page.getByTestId("finding").first()).toBeVisible({ timeout: 30_000 });
    await expectClean(page, "the insights tab");

    await page.getByTestId("finding").first().getByText("How we know").click();
    await expectClean(page, "an opened finding");

    await page.getByRole("tab", { name: "Story" }).click();
    await expect(page.getByTestId("story-headline")).toBeVisible({ timeout: 30_000 });
    await expectClean(page, "the story tab");

    await page.goto("/app");
    await expect(page.getByTestId("project-card").first()).toBeVisible();
    await expectClean(page, "the projects list");
    await page.getByTestId("project-card").first().getByRole("button", { name: /Actions for/ }).click();
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
    await expectClean(page, "a project's action menu");
  });

  test("present mode, on the headline numbers and on a chart", async ({ page }) => {
    await signUp(page);
    await sampleProject(page, "Delivery drops");
    await page.getByRole("button", { name: "Present", exact: true }).click();
    await expect(page.getByTestId("present")).toBeVisible();
    await page.waitForTimeout(600);
    await expectClean(page, "present mode on the headline numbers");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("present").getByRole("img").first()).toBeVisible();
    await page.waitForTimeout(600);
    await expectClean(page, "present mode on a chart");
  });

  test("the attach-your-file step", async ({ page }) => {
    await signUp(page);
    await sampleProject(page);
    await page.getByRole("button", { name: "Remove from this device" }).click();
    await expect(page.getByText("Attach your file to open this dashboard")).toBeVisible();
    await expectClean(page, "the attach step");
  });
});
