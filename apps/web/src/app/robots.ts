import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/brand";

/** Search engines may read the public pages. The signed-in app, the API and published links (which are never indexed) are off limits. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api/", "/s/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
