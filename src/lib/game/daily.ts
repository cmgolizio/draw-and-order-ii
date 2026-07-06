/**
 * Daily-case clock (client-safe, Phase 6): dailies flip at a fixed UTC hour
 * (00:00 UTC), displayed to the player as a local countdown. Case numbers
 * come from the UTC date, e.g. "#20260703".
 */
import type { LocalRound } from "@/lib/game/anon-id";

export function utcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function utcYesterdayString(now: Date = new Date()): string {
  return utcDateString(new Date(now.getTime() - 86_400_000));
}

/** "2026-07-03" → "#20260703" */
export function caseNumber(date: string): string {
  return `#${date.replaceAll("-", "")}`;
}

/** ms until the next daily flips (the next UTC midnight). */
export function msUntilNextCase(now: Date = new Date()): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(0, next - now.getTime());
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/**
 * Daily streak from the local history mirror (anonymous players): count of
 * consecutive scored daily dates anchored at today or yesterday, matching
 * the server-side user_stats logic.
 */
export function localDailyStreak(
  history: Pick<LocalRound, "mode" | "dailyDate" | "score">[],
  now: Date = new Date(),
): number {
  const dates = [
    ...new Set(
      history
        .filter((r) => r.mode === "daily" && r.score !== null && r.dailyDate)
        .map((r) => r.dailyDate as string),
    ),
  ].sort((a, b) => (a < b ? 1 : -1));

  if (dates.length === 0) return 0;
  const anchor = dates[0];
  if (anchor !== utcDateString(now) && anchor !== utcYesterdayString(now)) {
    return 0;
  }

  let streak = 0;
  const anchorMs = Date.parse(`${anchor}T00:00:00Z`);
  for (const [i, date] of dates.entries()) {
    if (date === utcDateString(new Date(anchorMs - i * 86_400_000))) streak++;
    else break;
  }
  return streak;
}