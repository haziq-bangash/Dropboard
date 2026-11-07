import type { Mail } from "./mailer";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function layout(heading: string, intro: string, action: string, url: string, outro: string): Pick<Mail, "text" | "html"> {
  const text = `${heading}\n\n${intro}\n\n${action}: ${url}\n\n${outro}\n\nDropboard`;
  const html = `<div style="background:#FDF6E3;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#233038">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <p style="margin:0 0 24px;font-size:18px;font-weight:600">Dropboard</p>
    <h1 style="margin:0 0 12px;font-size:22px">${esc(heading)}</h1>
    <p style="margin:0 0 24px;line-height:1.5">${esc(intro)}</p>
    <p style="margin:0 0 24px"><a href="${esc(url)}" style="display:inline-block;background:#075056;color:#FDF6E3;text-decoration:none;padding:12px 20px;border-radius:10px">${esc(action)}</a></p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#5a666c">If the button does not work, paste this link into your browser:<br><span style="word-break:break-all">${esc(url)}</span></p>
    <p style="margin:16px 0 0;font-size:13px;color:#5a666c">${esc(outro)}</p>
  </div></div>`;
  return { text, html };
}

export const verifyEmail = (to: string, url: string): Mail => ({
  to,
  subject: "Confirm your email for Dropboard",
  ...layout("Confirm your email", "One click and your account is ready.", "Confirm email", url, "If you did not create an account, you can ignore this message."),
});

export const resetPassword = (to: string, url: string): Mail => ({
  to,
  subject: "Reset your Dropboard password",
  ...layout("Reset your password", "Use the button below to choose a new password. The link works for one hour.", "Choose a new password", url, "If you did not ask for this, you can ignore this message. Your password stays the same."),
});
