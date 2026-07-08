import { describe, expect, it } from "vitest";
import { localDailyStreak, msUntilNextCase, utcDateString } from "@/lib/game/daily";
import { estimateJudgeCostUsd } from "@/lib/game/judge-cost";

const NOW = new Date("2026-07-06T15:00:00Z");

function daily(dailyDate: string, score: number | null = 80) {
  return { mode: "daily" as const, dailyDate, score };
}

describe("localDailyStreak (streak survives anon→auth migration)", () => {
  it("counts consecutive scored dailies anchored at today", () => {
    const history = [
      daily("2026-07-06"),
      daily("2026-07-05"),
      daily("2026-07-04"),
    ];
    expect(localDailyStreak(history, NOW)).toBe(3);
  });

  it("keeps a streak alive when today hasn't been played yet", () => {
    const history = [daily("2026-07-05"), daily("2026-07-04")];
    expect(localDailyStreak(history, NOW)).toBe(2);
  });

  it("breaks on a gap", () => {
    const history = [
      daily("2026-07-06"),
      daily("2026-07-04"), // missed the 5th
      daily("2026-07-03"),
    ];
    expect(localDailyStreak(history, NOW)).toBe(1);
  });

  it("is dead once the last daily is older than yesterday", () => {
    expect(localDailyStreak([daily("2026-07-02")], NOW)).toBe(0);
  });

  it("ignores forfeits and practice rounds", () => {
    const history = [
      daily("2026-07-06", null), // forfeit — no score, no streak credit
      { mode: "practice" as const, dailyDate: null, score: 90 },
      daily("2026-07-05"),
    ];
    expect(localDailyStreak(history, NOW)).toBe(1);
  });

  it("deduplicates repeated dates instead of double-counting", () => {
    const history = [
      daily("2026-07-06"),
      daily("2026-07-06"),
      daily("2026-07-05"),
    ];
    expect(localDailyStreak(history, NOW)).toBe(2);
  });
});

describe("daily clock", () => {
  it("flips at 00:00 UTC", () => {
    expect(msUntilNextCase(NOW)).toBe(9 * 3600 * 1000);
    expect(utcDateString(NOW)).toBe("2026-07-06");
  });
});

describe("estimateJudgeCostUsd", () => {
  it("prices a Sonnet-class call from the token table", () => {
    // 1M in / 1M out at $3 + $15.
    expect(
      estimateJudgeCostUsd("claude-sonnet-5", {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      }),
    ).toBe(18);
  });

  it("over-counts unknown models rather than under-counting", () => {
    const unknown = estimateJudgeCostUsd("mystery-model", {
      input_tokens: 100_000,
      output_tokens: 10_000,
    });
    const cheapest = estimateJudgeCostUsd("claude-haiku-4-5", {
      input_tokens: 100_000,
      output_tokens: 10_000,
    });
    expect(unknown).toBeGreaterThan(cheapest);
  });

  it("rounds to four decimal places", () => {
    const usd = estimateJudgeCostUsd("claude-sonnet-5", {
      input_tokens: 4321,
      output_tokens: 387,
    });
    expect(usd).toBe(Math.round(usd * 10_000) / 10_000);
  });
});