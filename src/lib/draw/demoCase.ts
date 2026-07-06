/**
 * Built-in fallback case so /draw works with zero backend (no Supabase env,
 * empty pool, storage miss). Also what local dev sees out of the box.
 */

export type DrawBriefing = {
  source: "live" | "demo";
  /** The open round this sketch belongs to (Phase 4); null for the demo. */
  roundId: string | null;
  mode: "practice" | "daily";
  /** Set for daily rounds (Phase 6); flows through to the share line. */
  dailyDate: string | null;
  difficulty: "rookie" | "detective" | "cold_case";
  statement: string;
  statementTeaser: string;
  /** Signed URL for the pre-rendered silhouette, or null to use the demo guide. */
  silhouetteUrl: string | null;
};

export const DEMO_BRIEFING: Omit<DrawBriefing, "silhouetteUrl"> = {
  source: "demo",
  roundId: null,
  mode: "practice",
  dailyDate: null,
  difficulty: "detective",
  statement:
    "It was over fast, but I'd know him again. Maybe mid-40s? Long face. He had a mustache — or heavy stubble, hard to say under the streetlight. Hair swept back, going gray at the sides I think. Deep-set eyes. Honestly the thing I remember is the crooked nose, bent once to the left like an old break.",
  statementTeaser:
    "Long-faced man, maybe mid-40s, swept-back hair, crooked nose.",
};

/** Simple head-and-shoulders guide shape, inlined so it needs no storage. */
export const DEMO_SILHOUETTE_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1040">` +
      `<g fill="#1a1814">` +
      `<ellipse cx="400" cy="420" rx="185" ry="245"/>` +
      `<rect x="335" y="620" width="130" height="130"/>` +
      `<path d="M 90 1040 Q 400 690 710 1040 Z"/>` +
      `</g></svg>`,
  );