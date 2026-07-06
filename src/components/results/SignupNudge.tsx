"use client";

/**
 * The post-score signup nudge (Phase 5): only after a good moment — an
 * anonymous player with a decent score — and never a wall. Signed-in
 * players (and keyless local dev, where there's nothing to sign into)
 * see nothing.
 */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { InkButton } from "@/components/ui/InkButton";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

/** "A decent result" — worth bragging about, low enough to trigger often. */
export const NUDGE_MIN_SCORE = 50;

export function SignupNudge({ score }: { score: number | null }) {
  const [anonymous, setAnonymous] = useState(false);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data }) => {
        setAnonymous(data.session === null);
      });
    } catch {
      // No Supabase env — nothing to sign into, so no nudge.
    }
  }, []);

  if (!anonymous || score === null || score < NUDGE_MIN_SCORE) return null;

  return (
    <aside className="flex flex-col items-start gap-3 border border-stamp-blue/50 bg-paper p-4">
      <TypewriterHeading as="h2" className="text-base">
        Save this to your record, detective?
      </TypewriterHeading>
      <p className="max-w-prose text-sm text-ink-soft">
        A score like that deserves a permanent file. Sign in and your case
        history — this sketch included — follows you to any desk.
      </p>
      <InkButton variant="blue" href="/login">
        Get your badge
      </InkButton>
    </aside>
  );
}