"use client";

/**
 * The header's sign-in slot (Phase 5): "Sign in" for anonymous visitors,
 * "On duty" (→ /me) once a session exists. Renders the anonymous state first
 * so the static shell never flashes for the signed-out majority.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function HeaderAuthLink({ className }: { className?: string }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data }) => {
        setSignedIn(data.session !== null);
      });
      const { data: sub } = supabase.auth.onAuthStateChange(
        (_event, session) => setSignedIn(session !== null),
      );
      return () => sub.subscription.unsubscribe();
    } catch {
      // No Supabase env — stay signed out.
    }
  }, []);

  return (
    <Link href={signedIn ? "/me" : "/login"} className={className}>
      {signedIn ? "On duty" : "Sign in"}
    </Link>
  );
}