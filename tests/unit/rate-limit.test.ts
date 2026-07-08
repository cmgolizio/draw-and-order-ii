import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hitJudgeBudget, hitLimit, LIMITS } from "@/lib/server/rate-limit";

/** A SupabaseClient double exposing only the rpc surface hitLimit touches. */
function fakeAdmin(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockReturnValue(
    Object.assign(Promise.resolve(result), {
      then: Promise.resolve(result).then.bind(Promise.resolve(result)),
    }),
  );
  return { admin: { rpc } as unknown as SupabaseClient, rpc };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("LIMITS (build-plan abuse-control numbers)", () => {
  it("caps submissions at 10/hour per IP and per identity", () => {
    expect(LIMITS.submitPerIp).toMatchObject({ windowSeconds: 3600, max: 10 });
    expect(LIMITS.submitPerIdentity).toMatchObject({
      windowSeconds: 3600,
      max: 10,
    });
  });

  it("caps daily submissions at 30 anonymous / 60 authed", () => {
    expect(LIMITS.submitAnonPerDay).toMatchObject({
      windowSeconds: 86400,
      max: 30,
    });
    expect(LIMITS.submitAuthedPerDay).toMatchObject({
      windowSeconds: 86400,
      max: 60,
    });
  });

  it("uses distinct buckets so keys can never collide across limits", () => {
    const buckets = Object.values(LIMITS).map((l) => l.bucket);
    expect(new Set(buckets).size).toBe(buckets.length);
  });
});

describe("hitLimit", () => {
  it("allows when the RPC says the hit fits the window", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // no GC sweep
    const { admin, rpc } = fakeAdmin({ data: true, error: null });
    await expect(
      hitLimit(admin, LIMITS.submitPerIp, "1.2.3.4"),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_bucket: "submit-ip",
      p_key: "1.2.3.4",
      p_window_seconds: 3600,
      p_max: 10,
    });
  });

  it("blocks when the RPC says the window is full", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { admin } = fakeAdmin({ data: false, error: null });
    await expect(
      hitLimit(admin, LIMITS.submitPerIdentity, "a:xyz"),
    ).resolves.toBe(false);
  });

  it("throws (fails closed upstream) when the RPC errors", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { admin } = fakeAdmin({ data: null, error: { message: "boom" } });
    await expect(
      hitLimit(admin, LIMITS.createPerIp, "1.2.3.4"),
    ).rejects.toThrow(/rate_limit_hit failed: boom/);
  });

  it("sweeps old events opportunistically (~2% of hits)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const { admin, rpc } = fakeAdmin({ data: true, error: null });
    await hitLimit(admin, LIMITS.createPerIp, "1.2.3.4");
    expect(rpc).toHaveBeenCalledWith("rate_limit_gc");
  });
});

describe("hitJudgeBudget (spend circuit breaker)", () => {
  it("defaults to 300 judge calls per day", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { admin, rpc } = fakeAdmin({ data: true, error: null });
    await expect(hitJudgeBudget(admin)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_bucket: "judge-global",
      p_key: "global",
      p_window_seconds: 86400,
      p_max: 300,
    });
  });

  it("honors the JUDGE_DAILY_BUDGET env override", async () => {
    vi.stubEnv("JUDGE_DAILY_BUDGET", "7");
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const { admin, rpc } = fakeAdmin({ data: false, error: null });
    await expect(hitJudgeBudget(admin)).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith(
      "rate_limit_hit",
      expect.objectContaining({ p_max: 7 }),
    );
  });
});