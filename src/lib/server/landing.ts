import "server-only";
import sharp from "sharp";
import type { Difficulty } from "@/lib/game/trait-sheet";
import { utcToday } from "@/lib/server/api";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Landing-page data (Phase 7): one REAL statement and a real-but-sealed
 * suspect thumbnail from the live pool, plus today's leaderboard. Everything
 * here degrades to null/empty — the landing page must render with no
 * Supabase env, an empty pool, or a storage outage.
 *
 * The thumbnail is downscaled to a couple dozen pixels server-side BEFORE it
 * ships, so the client only ever receives an unidentifiable smear — the real
 * suspect image never leaves the private bucket.
 */

export type LandingHero = {
  statement: string;
  teaser: string;
  difficulty: Difficulty;
  /** Tiny (~24px) blurred PNG data URL, or null when storage was unreachable. */
  blurThumb: string | null;
};

export type LeaderboardRow = {
  rank: number;
  handle: string;
  finalScore: number;
};

const THUMB_WIDTH = 24;
const THUMB_HEIGHT = 31; // matches the 800x1040 portrait aspect

/** Deterministic per-day pick so the hero case rotates with the dailies. */
function pickIndex(seed: string, length: number): number {
  let h = 11;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 100_003;
  return h % length;
}

export async function getLandingHero(): Promise<LandingHero | null> {
  try {
    const admin = createAdminClient();
    const { data: pool, error } = await admin
      .from("suspects")
      .select("id, statement, statement_teaser, difficulty, image_path")
      .eq("status", "live")
      .order("created_at", { ascending: true })
      .limit(200);
    if (error || !pool || pool.length === 0) return null;

    const suspect = pool[pickIndex(utcToday(), pool.length)];

    let blurThumb: string | null = null;
    if (suspect.image_path) {
      const { data: blob } = await admin.storage
        .from("suspect-images")
        .download(suspect.image_path);
      if (blob) {
        const png = await sharp(Buffer.from(await blob.arrayBuffer()))
          .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover" })
          .blur(1)
          .png()
          .toBuffer();
        blurThumb = `data:image/png;base64,${png.toString("base64")}`;
      }
    }

    return {
      statement: suspect.statement,
      teaser: suspect.statement_teaser,
      difficulty: suspect.difficulty,
      blurThumb,
    };
  } catch {
    return null;
  }
}

export async function getDailyLeaderboardSnippet(): Promise<LeaderboardRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("daily_leaderboard", {
      for_date: utcToday(),
      top_n: 5,
    });
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => ({
      rank: Number(row.rank),
      handle: String(row.handle),
      finalScore: Number(row.final_score),
    }));
  } catch {
    return [];
  }
}