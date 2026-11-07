import type { Context } from "hono";
import { timingSafeEqual } from "node:crypto";

export type Verdict = { ok: true } | { ok: false; retryAfterSeconds: number };

export interface Limiter {
  /** Count one hit for this key, or say how long to wait. */
  take(key: string): Verdict;
  /** Is this key over its limit right now? Counts nothing. */
  peek(key: string): Verdict;
  /** Count one hit without checking. */
  record(key: string): void;
}

/**
 * A sliding window: at most `max` hits per `windowMs` for each key. It lives in this process's memory, so with several
 * Cloud Run instances each keeps its own count. That is enough to stop floods and slow password guessing on one
 * instance; a shared store (Redis) is the upgrade if abuse ever needs a strict global limit.
 */
export function createLimiter(max: number, windowMs: number, now: () => number = Date.now): Limiter {
  const hits = new Map<string, number[]>();
  const MAX_KEYS = 10_000;

  function live(key: string): number[] {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((h) => h > t - windowMs);
    if (recent.length) hits.set(key, recent);
    else hits.delete(key);
    return recent;
  }

  function sweep() {
    for (const key of [...hits.keys()]) live(key);
    // still too many distinct keys: forget the oldest rather than grow without bound
    for (const key of hits.keys()) {
      if (hits.size <= MAX_KEYS) break;
      hits.delete(key);
    }
  }

  const check = (recent: number[]): Verdict =>
    recent.length < max ? { ok: true } : { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now()) / 1000)) };

  return {
    peek: (key) => check(live(key)),
    record(key) {
      if (hits.size > MAX_KEYS) sweep();
      hits.set(key, [...live(key), now()]);
    },
    take(key) {
      const verdict = check(live(key));
      if (verdict.ok) this.record(key);
      return verdict;
    },
  };
}

const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Who is asking, as well as we can tell.
 *
 * Our web app relays every visitor, so on its own the API would see one address for everyone. When PROXY_SECRET is set,
 * the web app sends the visitor's address in X-Dropboard-Client-Ip together with that secret, and it is trusted only
 * with the right secret. Otherwise (or for anyone calling the API directly) the last entry of X-Forwarded-For is used:
 * behind Google's front end that is the address that connected to it, which cannot be faked from outside.
 */
export function clientKey(c: Context): string {
  const secret = process.env.PROXY_SECRET;
  if (secret) {
    const given = c.req.header("x-dropboard-proxy-secret");
    const ip = c.req.header("x-dropboard-client-ip")?.trim();
    if (given && ip && sameSecret(given, secret)) return ip.slice(0, 64);
  }
  const forwarded = c.req.header("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? "unknown";
}

export const tooManyRequests = (c: Context, retryAfterSeconds: number) => {
  c.header("retry-after", String(retryAfterSeconds));
  return c.json({ error: "too many requests", retryAfter: retryAfterSeconds }, 429);
};
