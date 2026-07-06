"use client";

/**
 * The Wordle-style share line (Phase 6): a copyable text block —
 * `Draw & Order — Case #20260702 🕵️ 78/100 · Best: nose · Miss: hair ·
 * drawandorder.app`. The generated share-card image lands in Phase 7.
 */
import { useEffect, useRef, useState } from "react";
import type { RoundResultPayload } from "@/lib/game/api-types";
import { caseNumber } from "@/lib/game/daily";
import type { TraitKey } from "@/lib/game/scoring";
import { InkButton } from "@/components/ui/InkButton";

const SITE = "drawandorder.app";

const SHARE_TRAIT_LABELS: Record<TraitKey, string> = {
  faceShape: "face shape",
  proportions: "proportions",
  hairStyle: "hair",
  eyebrows: "eyebrows",
  eyes: "eyes",
  nose: "nose",
  mouth: "mouth",
  distinctiveMarks: "marks",
};

const DIFFICULTY_LABELS = {
  rookie: "Rookie",
  detective: "Detective",
  cold_case: "Cold Case",
} as const;

export function shareText(payload: RoundResultPayload): string | null {
  if (payload.forfeited || payload.score === null || !payload.breakdown) {
    return null;
  }
  const caseLabel =
    payload.mode === "daily" && payload.dailyDate
      ? `Case ${caseNumber(payload.dailyDate)}`
      : `Practice · ${DIFFICULTY_LABELS[payload.difficulty]}`;
  const score = Math.round(payload.score);
  const best = SHARE_TRAIT_LABELS[payload.breakdown.bestFeature];
  const miss = SHARE_TRAIT_LABELS[payload.breakdown.biggestMiss];
  return `Draw & Order — ${caseLabel} 🕵️ ${score}/100 · Best: ${best} · Miss: ${miss} · ${SITE}`;
}

export function ShareBlock({ payload }: { payload: RoundResultPayload }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const text = shareText(payload);
  if (!text) return null;

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked — the text is right there to copy by hand.
    }
  }

  return (
    <section
      aria-label="Share your result"
      className="flex flex-col gap-3 border border-graphite-200 bg-paper p-4"
    >
      <h2 className="type-label text-xs text-ink-faint">Wire the newsroom</h2>
      <p className="font-typewriter text-sm leading-relaxed break-words text-ink select-all">
        {text}
      </p>
      <InkButton
        variant="blue"
        onClick={copy}
        className="self-start"
        aria-live="polite"
      >
        {copied ? "Copied — get it out there" : "Copy result"}
      </InkButton>
    </section>
  );
}