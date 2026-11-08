import type { Mail } from "./mailer";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The colours of the app and the homepage. Email clients know no CSS variables, so they are written out. */
const C = {
  paper: "#FDF6E3",
  ink: "#233038",
  muted: "#5C6B73",
  teal: "#075056",
  cream: "#FDF6E3",
  yellow: "#F4D47C",
  tint: "#FBF0CE",
  line: "#E7DDBF",
} as const;

/** Georgia stands in for the app's serif: email clients cannot load web fonts. */
const SERIF = "Georgia,'Times New Roman',Times,serif";
const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

/** The address of the site, for the logo and the footer links. */
const site = () => (process.env.WEB_ORIGIN ?? "https://dropboard.de").replace(/\/+$/, "");

/** A heading with its last word in italics, as the app sets its titles. */
function title(heading: string): string {
  const words = heading.split(" ");
  const last = words.pop() ?? "";
  return `${words.length ? `${esc(words.join(" "))} ` : ""}<em style="font-style:italic">${esc(last)}</em>`;
}

interface Message {
  /** The headline, in sentence case. */
  heading: string;
  /** What the message is about, in a sentence. Also the preview some inboxes show beside the subject. */
  intro: string;
  /** The text on the button, and where it goes. */
  action: string;
  url: string;
  /** What to do if this was not you. */
  outro: string;
}

function layout({ heading, intro, action, url, outro }: Message): Pick<Mail, "text" | "html"> {
  const base = site();
  const text = [
    heading,
    "",
    intro,
    "",
    `${action}: ${url}`,
    "",
    outro,
    "",
    "Dropboard: turn any spreadsheet into a dashboard, without handing over your data.",
    `Privacy: ${base}/privacy`,
    `Terms: ${base}/terms`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper}">${esc(intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper}">
<tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px">
    <tr><td style="background:${C.teal};border-radius:28px 28px 0 0;padding:32px 32px 36px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:12px"><img src="${esc(base)}/brand/logo-mark-email.png" width="40" height="40" alt="" style="display:block;border:0;border-radius:9px"></td>
        <td style="font-family:${SANS};font-size:18px;font-weight:600;color:${C.cream}">Dropboard</td>
      </tr></table>
      <h1 style="margin:28px 0 0;font-family:${SERIF};font-size:38px;line-height:1.08;font-weight:normal;color:${C.cream}">${title(heading)}</h1>
    </td></tr>
    <tr><td style="height:8px;line-height:8px;font-size:0;background:${C.yellow}">&nbsp;</td></tr>
    <tr><td style="background:#FFFFFF;border-radius:0 0 28px 28px;padding:32px;font-family:${SANS};color:${C.ink}">
      <p style="margin:0 0 28px;font-size:17px;line-height:1.55">${esc(intro)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="background:${C.teal};border-radius:999px"><a href="${esc(url)}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;font-weight:600;color:${C.cream};text-decoration:none;border-radius:999px">${esc(action)}</a></td>
      </tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px"><tr>
        <td style="background:${C.tint};border-radius:16px;padding:16px 18px;font-size:13px;line-height:1.55;color:${C.muted}">If the button does not work, paste this link into your browser:<br><a href="${esc(url)}" style="color:${C.teal};word-break:break-all">${esc(url)}</a></td>
      </tr></table>
      <p style="margin:24px 0 0;font-size:14px;line-height:1.55;color:${C.muted}">${esc(outro)}</p>
    </td></tr>
    <tr><td style="padding:24px 8px 0;font-family:${SANS};font-size:13px;line-height:1.6;color:${C.muted};text-align:center">
      <span style="font-family:${SERIF};font-size:16px;color:${C.ink}">Turn any spreadsheet into a dashboard, <em>without handing over your data.</em></span><br>
      <a href="${esc(base)}/privacy" style="color:${C.muted}">Privacy</a> &nbsp;&middot;&nbsp; <a href="${esc(base)}/terms" style="color:${C.muted}">Terms</a> &nbsp;&middot;&nbsp; <a href="${esc(base)}/trust" style="color:${C.muted}">Trust center</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
  return { text, html };
}

export const verifyEmail = (to: string, url: string): Mail => ({
  to,
  subject: "Confirm your email for Dropboard",
  ...layout({
    heading: "Confirm your email",
    intro: "One click and your account is ready.",
    action: "Confirm email",
    url,
    outro: "If you did not create an account, you can ignore this message.",
  }),
});

export const resetPassword = (to: string, url: string): Mail => ({
  to,
  subject: "Reset your Dropboard password",
  ...layout({
    heading: "Reset your password",
    intro: "Use the button below to choose a new password. The link works for one hour.",
    action: "Choose a new password",
    url,
    outro: "If you did not ask for this, you can ignore this message. Your password stays the same.",
  }),
});

export const confirmEmailChange = (to: string, newEmail: string, url: string): Mail => ({
  to,
  subject: "Confirm the change of your Dropboard email",
  ...layout({
    heading: "Confirm your new email",
    intro: `You asked to change the email on your Dropboard account to ${newEmail}. Confirm here, then we will send a link to the new address.`,
    action: "Confirm the change",
    url,
    outro: "If you did not ask for this, you can ignore this message and your email stays the same.",
  }),
});
