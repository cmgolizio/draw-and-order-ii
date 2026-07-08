import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Migration logic (Phase 5, hardened in Phase 8): the one-time anon claim.
 * The route runs for real — Supabase clients are the only doubles, so the
 * burn/race/idempotency branching is what's actually under test.
 */

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { POST } from "@/app/api/migrate-anon/route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ANON_ID = "5cf10a56-6f7d-4c68-9e0f-6d1a3f4b7a10";
const USER_ID = "e5a1c8aa-1111-4222-8333-944445555666";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

type AdminOptions = {
  /** rate_limit_hit verdicts, consumed in call order (default: allow). */
  rateLimit?: boolean[];
  claim?: RpcResult;
  /** Who owns the id in claimed_anon_ids (the 23505-race lookup). */
  claimedBy?: string | null;
};

function mockAuth(userId: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: userId ? { id: userId } : null },
      }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function mockAdmin(options: AdminOptions = {}) {
  const rateVerdicts = [...(options.rateLimit ?? [])];
  const removed: string[][] = [];

  const rpc = vi.fn((name: string) => {
    if (name === "rate_limit_hit") {
      return Promise.resolve({
        data: rateVerdicts.length > 0 ? rateVerdicts.shift() : true,
        error: null,
      });
    }
    if (name === "rate_limit_gc") {
      return Promise.resolve({ data: null, error: null });
    }
    if (name === "claim_anon_rounds") {
      return Promise.resolve(
        options.claim ?? { data: null, error: { message: "unexpected" } },
      );
    }
    throw new Error(`unexpected rpc: ${name}`);
  });

  const from = vi.fn((table: string) => {
    const rows: Record<string, unknown> = {
      profiles: { id: USER_ID },
      claimed_anon_ids: options.claimedBy
        ? { user_id: options.claimedBy }
        : null,
    };
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
    };
    return chain;
  });

  const remove = vi.fn(async (paths: string[]) => {
    removed.push(paths);
    return { data: null, error: null };
  });

  const admin = {
    rpc,
    from,
    storage: { from: () => ({ remove }) },
  } as unknown as SupabaseClient;
  vi.mocked(createAdminClient).mockReturnValue(admin);
  return { rpc, removed };
}

function request(body: unknown): NextRequest {
  return new NextRequest("http://precinct.test/api/migrate-anon", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Math, "random").mockReturnValue(0.99); // no GC noise
});

describe("POST /api/migrate-anon", () => {
  it("rejects unauthenticated claims (401)", async () => {
    mockAuth(null);
    mockAdmin();
    const res = await POST(request({ anonId: ANON_ID }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("auth_required");
  });

  it("rejects a malformed anonId (400)", async () => {
    mockAuth(USER_ID);
    mockAdmin();
    const res = await POST(request({ anonId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("rate limits before touching the claim (429)", async () => {
    mockAuth(USER_ID);
    const { rpc } = mockAdmin({ rateLimit: [false, true] });
    const res = await POST(request({ anonId: ANON_ID }));
    expect(res.status).toBe(429);
    expect(rpc).not.toHaveBeenCalledWith(
      "claim_anon_rounds",
      expect.anything(),
    );
  });

  it("claims rounds and sweeps conflict-loser drawings", async () => {
    mockAuth(USER_ID);
    const { rpc, removed } = mockAdmin({
      claim: {
        data: {
          status: "claimed",
          claimed: 4,
          dropped_drawings: ["anon/x/r1.png"],
        },
        error: null,
      },
    });
    const res = await POST(request({ anonId: ANON_ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "claimed", claimedRounds: 4 });
    expect(rpc).toHaveBeenCalledWith("claim_anon_rounds", {
      p_anon_id: ANON_ID,
      p_user_id: USER_ID,
    });
    expect(removed).toEqual([["anon/x/r1.png"]]);
  });

  it("refuses an id already burned into another account (409)", async () => {
    mockAuth(USER_ID);
    mockAdmin({
      claim: {
        data: { status: "burned", claimed: 0, dropped_drawings: [] },
        error: null,
      },
    });
    const res = await POST(request({ anonId: ANON_ID }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("anon_id_burned");
  });

  it("treats a same-user race as an idempotent success", async () => {
    mockAuth(USER_ID);
    mockAdmin({
      claim: { data: null, error: { code: "23505", message: "duplicate" } },
      claimedBy: USER_ID,
    });
    const res = await POST(request({ anonId: ANON_ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "already_claimed",
      claimedRounds: 0,
    });
  });

  it("treats a cross-user race as a burned id (409)", async () => {
    mockAuth(USER_ID);
    mockAdmin({
      claim: { data: null, error: { code: "23505", message: "duplicate" } },
      claimedBy: "someone-else",
    });
    const res = await POST(request({ anonId: ANON_ID }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("anon_id_burned");
  });
});