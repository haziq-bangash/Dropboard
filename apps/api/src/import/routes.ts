import { zValidator } from "@hono/zod-validator";
import type { Hono, MiddlewareHandler } from "hono";
import { z } from "zod";
import { createLimiter } from "../rate-limit";
import type { AppEnv } from "../types";
import { fetchPublic, ImportError, sheetsCsvUrl, type FetchOptions, type Fetched } from "./public-fetch";

export interface ImportDeps {
  requireUser: MiddlewareHandler<AppEnv>;
  /** Replaced in tests. */
  fetchLink?: (url: string, options?: FetchOptions) => Promise<Fetched>;
  /** Options for every fetch. Tests loosen the address checks here; production passes nothing. */
  options?: FetchOptions;
}

const Body = z.object({ url: z.string().trim().min(8).max(2000) });

/**
 * POST /api/import/fetch: fetch a file from a public address (a CSV or JSON link, or a Google Sheet) and pass it to the browser,
 * which reads it like any other file. The file is not stored and not logged: it goes through this server on the way in.
 * Needs a signed-in person, and is limited per person so it cannot be used as a free download service.
 */
export function registerImportRoutes(app: Hono<AppEnv>, { requireUser, fetchLink = fetchPublic, options }: ImportDeps) {
  const perMinute = createLimiter(10, 60_000);
  const perHour = createLimiter(60, 60 * 60_000);

  app.post("/api/import/fetch", requireUser, zValidator("json", Body), async (c) => {
    const userId = c.get("userId");
    for (const limiter of [perMinute, perHour]) {
      const verdict = limiter.take(userId);
      if (!verdict.ok) {
        c.header("retry-after", String(verdict.retryAfterSeconds));
        return c.json({ error: `Too many imports. Try again in ${verdict.retryAfterSeconds} seconds.`, code: "rate_limited" }, 429);
      }
    }
    try {
      const got = await fetchLink(sheetsCsvUrl(c.req.valid("json").url), options);
      return c.body(new Uint8Array(got.body), 200, {
        "content-type": got.contentType,
        "x-import-filename": encodeURIComponent(got.filename),
        "cache-control": "no-store",
      });
    } catch (e) {
      if (e instanceof ImportError) return c.json({ error: e.message, code: e.code }, e.status as 400 | 413 | 422 | 502 | 504);
      return c.json({ error: "Could not fetch that address.", code: "failed" }, 502);
    }
  });
}
