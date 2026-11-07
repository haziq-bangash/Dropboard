type Env = Record<string, string | undefined>;

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** What the API knows about sending email. Vendors live here only, chosen from the environment. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 *   MAIL_PROVIDER   resend | log | none   (default: resend if RESEND_API_KEY is set, otherwise none)
 *   MAIL_FROM       sender, e.g. "Dropboard <hello@your-domain.com>" (the domain must be verified with the provider)
 *   RESEND_API_KEY  for resend
 *
 * "log" prints each email to the server console instead of sending it (local development and tests).
 * With nothing configured there is no mailer, and password reset and email verification stay off.
 */
export function createMailerFromEnv(env: Env = process.env, deps: { fetch?: typeof fetch } = {}): Mailer | undefined {
  const requested = env.MAIL_PROVIDER?.trim().toLowerCase();
  const provider = requested ?? (env.RESEND_API_KEY ? "resend" : "none");
  const doFetch = deps.fetch ?? fetch;

  switch (provider) {
    case "none":
      return undefined;

    case "log":
      return {
        async send(mail) {
          console.log(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
        },
      };

    case "resend": {
      if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
        console.warn("MAIL_PROVIDER=resend needs RESEND_API_KEY and MAIL_FROM: email disabled");
        return undefined;
      }
      const key = env.RESEND_API_KEY;
      const from = env.MAIL_FROM;
      return {
        async send(mail) {
          const res = await doFetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) throw new Error(`Email provider answered ${res.status}`);
        },
      };
    }

    default:
      console.warn(`Unknown MAIL_PROVIDER "${requested}": email disabled`);
      return undefined;
  }
}
