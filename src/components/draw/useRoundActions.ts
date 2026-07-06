"use client";

/**
 * Submit/forfeit plumbing shared by the practice and daily flows (Phases 4–6):
 * file the sketch (or turn yourself in), stash the result payload, mirror the
 * round into local history, then move to /results/[roundId]. Stays "busy"
 * through the navigation on success so buttons can't double-fire.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage, forfeitRound, submitRound } from "@/lib/game/round-client";
import type { DrawBriefing } from "@/lib/draw/demoCase";
import type { SubmitArgs } from "@/components/draw/DraftWorkspace";

export type RoundBusy = "opening" | "submitting" | "forfeiting" | null;

export function useRoundActions(briefing: DrawBriefing | null) {
  const router = useRouter();
  const [busy, setBusy] = useState<RoundBusy>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(args: SubmitArgs) {
    if (!briefing?.roundId) return;
    setBusy("submitting");
    setError(null);
    try {
      const roundId = await submitRound(briefing, args);
      router.push(`/results/${roundId}`);
    } catch (e) {
      setError(
        errorMessage(
          e,
          "The submission didn't go through. Your round is still open — try again.",
        ),
      );
      setBusy(null);
    }
  }

  async function handleForfeit(drawingDataUrl: string | null) {
    if (!briefing?.roundId) return;
    setBusy("forfeiting");
    setError(null);
    try {
      const roundId = await forfeitRound(briefing, drawingDataUrl);
      router.push(`/results/${roundId}`);
    } catch (e) {
      setError(errorMessage(e, "Couldn't close the case. Try again."));
      setBusy(null);
    }
  }

  return { busy, setBusy, error, setError, handleSubmit, handleForfeit };
}