import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * The crawlable surface (Phase 8 SEO). Results pages are share targets with
 * unguessable ids — deliberately absent (and noindexed on the page itself),
 * as are the personal/auth pages.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl().origin;
  return [
    {
      url: `${base}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/daily`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}/draw`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/login`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}