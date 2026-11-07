import type { Context } from "hono";

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

/**
 * Who is asking, as well as we can tell. Behind Google's front end the last entry of X-Forwarded-For is the address that
 * connected to it. Requests relayed by our own web app all share that app's address, so for them this acts as a limit on
 * the whole app; the failed-password limit is keyed by link instead and does not depend on it.
 */
export function clientKey(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? "unknown";
}

export const tooManyRequests = (c: Context, retryAfterSeconds: number) => {
  c.header("retry-after", String(retryAfterSeconds));
  return c.json({ error: "too many requests", retryAfter: retryAfterSeconds }, 429);
};
