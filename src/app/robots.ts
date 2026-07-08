import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * Crawler directives (Phase 8 SEO): the game pages are fair game; the API,
 * auth plumbing, personal dossier, and per-round reports are not. Results
 * pages also carry robots noindex metadata — this keeps crawlers from even
 * knocking.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl().origin;
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/me", "/results/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}