"use client";

/**
 * Identity boot (Phase 5), mounted once in the root layout: when a signed-in
 * session and a local anonId coexist, claim the anonymous rounds into the
 * account via POST /api/migrate-anon, then retire the local id (the server
 * burns it permanently). Runs after sign-in on any page, so migration never
 * depends on the player visiting a particular screen.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { clearAnonIdentity, peekAnonId } from "@/lib/game/anon-id";
import type { MigrateAnonResponse } from "@/lib/game/api-types";
import { createClient } from "@/lib/supabase/client";

export function IdentityBoot() {
  const router = useRouter();
  const inFlight = useRef(false);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return; // No Supabase env — nothing to migrate into.
    }

    async function migrate() {
      if (inFlight.current) return;
      const anonId = peekAnonId();
      if (!anonId) return;
      inFlight.current = true;
      try {
        const res = await fetch("/api/migrate-anon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anonId }),
        });
        if (res.ok) {
          const data = (await res.json()) as MigrateAnonResponse;
          clearAnonIdentity();
          if (data.claimedRounds > 0) router.refresh();
        } else if (res.status === 409) {
          // Burned into another account — the id is useless now; retire it.
          clearAnonIdentity();
        } else {
          inFlight.current = false; // Transient — retry on the next signal.
        }
      } catch {
        inFlight.current = false;
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void migrate();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void migrate();
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  return null;
}