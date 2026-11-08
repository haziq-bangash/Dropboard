import { afterEach, describe, expect, it } from "vitest";
import { confirmEmailChange, resetPassword, verifyEmail } from "../src/mail/templates";

const URL_WITH_QUERY = "https://dropboard.de/api/auth/verify-email?token=abc&callbackURL=%2Fapp";

afterEach(() => {
  delete process.env.WEB_ORIGIN;
});

describe("email templates", () => {
  it("carry the link on the button and in plain text, with ampersands escaped in the HTML", () => {
    const mail = verifyEmail("a@b.co", URL_WITH_QUERY);
    expect(mail.to).toBe("a@b.co");
    expect(mail.subject).toBe("Confirm your email for Dropboard");
    // on the button, and twice in the fallback box (as a link and as text), escaped for HTML
    expect(mail.html.split("token=abc&amp;callbackURL=%2Fapp").length - 1).toBe(3);
    expect(mail.html).not.toContain("token=abc&callbackURL");
    expect(mail.text).toContain(`Confirm email: ${URL_WITH_QUERY}`);
  });

  it("look like the app: a teal header, a serif headline whose last word is italic, a pill button, no capitals forced", () => {
    const { html } = resetPassword("a@b.co", URL_WITH_QUERY);
    expect(html).toContain("#075056");
    expect(html).toContain("Georgia");
    expect(html).toContain('Reset your <em style="font-style:italic">password</em>');
    expect(html).toContain("border-radius:999px");
    expect(html).not.toMatch(/text-transform/i);
    // a client that inverts colours in dark mode is told this message is designed for light
    expect(html).toContain('name="color-scheme" content="light"');
  });

  it("show the logo from the site the message was sent for, with the legal links in the footer", () => {
    process.env.WEB_ORIGIN = "https://example.test/";
    const { html, text } = verifyEmail("a@b.co", URL_WITH_QUERY);
    expect(html).toContain('src="https://example.test/brand/logo-mark-email.png"');
    for (const page of ["privacy", "terms", "trust"]) expect(html).toContain(`href="https://example.test/${page}"`);
    expect(text).toContain("Privacy: https://example.test/privacy");
    expect(text).toContain("Terms: https://example.test/terms");
  });

  it("use dropboard.de when no site is configured", () => {
    expect(verifyEmail("a@b.co", URL_WITH_QUERY).html).toContain('src="https://dropboard.de/brand/logo-mark-email.png"');
  });

  it("put the message first in the inbox preview, hidden in the body", () => {
    const { html } = resetPassword("a@b.co", URL_WITH_QUERY);
    expect(html).toMatch(/<div style="display:none[^"]*">Use the button below to choose a new password\./);
  });

  it("never let an address typed by a person become markup", () => {
    const mail = confirmEmailChange("a@b.co", `"><script>alert(1)</script>@x.co`, URL_WITH_QUERY);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.text).toContain("<script>");
  });

  it("have a plain-text version that says the same thing", () => {
    for (const mail of [verifyEmail("a@b.co", URL_WITH_QUERY), resetPassword("a@b.co", URL_WITH_QUERY), confirmEmailChange("a@b.co", "n@b.co", URL_WITH_QUERY)]) {
      expect(mail.text.length).toBeGreaterThan(80);
      expect(mail.text).toContain(URL_WITH_QUERY);
      expect(mail.text).toContain("Dropboard");
    }
  });
});
