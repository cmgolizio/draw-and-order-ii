import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Who is playing this round (Phase 4): an authenticated user (from the
 * Supabase auth cookie) or an anonymous player presenting a client-generated
 * anonId. The anonId is only ever honored server-side for writes and for
 * matching a round it created — never for RLS reads.
 */

export type Identity =
  | { kind: "user"; id: string }
  | { kind: "anon"; id: string };

export async function resolveIdentity(
  anonId: string | undefined,
): Promise<Identity | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) return { kind: "user", id: data.user.id };
  if (anonId) return { kind: "anon", id: anonId };
  return null;
}

/** Namespaced key for rate limiting, so user and anon ids can't collide. */
export function identityRateKey(identity: Identity): string {
  return `${identity.kind === "user" ? "u" : "a"}:${identity.id}`;
}

export function ownsRound(
  identity: Identity,
  round: { user_id: string | null; anon_id: string | null },
): boolean {
  return identity.kind === "user"
    ? round.user_id === identity.id
    : round.anon_id !== null && round.anon_id === identity.id;
}

/** Best-effort client IP; Vercel/most proxies set x-forwarded-for. */
export function requestIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * rounds.user_id references profiles(id), but profile creation only becomes
 * a real signup flow in Phase 5 — until then, make sure an authed user has a
 * row before their first round. Handle collisions just retry.
 */
export async function ensureProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (data) return;

  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = `Det. #${Math.floor(1000 + Math.random() * 9000)}`;
    const { error } = await admin
      .from("profiles")
      .insert({ id: userId, handle });
    if (!error) return;
    if (error.code === "23505" && error.message.includes("profiles_pkey")) {
      return; // created concurrently — fine
    }
    if (error.code !== "23505") {
      throw new Error(`profile creation failed: ${error.message}`);
    }
  }
  throw new Error("profile creation failed: could not find a free handle");
}