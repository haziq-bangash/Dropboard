import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/brand";

/** The public pages worth finding. The sign-in page, the app and published links are left out on purpose. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: [string, number][] = [
    ["/", 1],
    ["/pricing", 0.8],
    ["/trust", 0.7],
    ["/privacy", 0.4],
    ["/terms", 0.4],
  ];
  return pages.map(([path, priority]) => ({ url: `${SITE_URL}${path === "/" ? "" : path}`, lastModified: new Date("2026-11-08"), priority }));
}
