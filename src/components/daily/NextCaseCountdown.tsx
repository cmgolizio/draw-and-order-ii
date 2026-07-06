"use client";

/**
 * Countdown to the next daily flip (Phase 6). Dailies flip at 00:00 UTC;
 * the ticker shows the remaining time in the player's local clock terms.
 */
import { useEffect, useState } from "react";
import { formatCountdown, msUntilNextCase } from "@/lib/game/daily";

export function NextCaseCountdown({
  onExpired,
}: {
  /** Called once when the clock hits zero (the next case just posted). */
  onExpired?: () => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(msUntilNextCase());
    // First paint via a 0ms timer: async, so the effect body stays pure.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const expired = remaining !== null && remaining <= 0;
  useEffect(() => {
    if (expired) onExpired?.();
  }, [expired, onExpired]);

  return (
    <p className="flex items-baseline gap-2">
      <span className="type-label text-xs text-ink-faint">Next case in</span>
      <span
        className="font-typewriter text-2xl text-ink tabular-nums"
        aria-live="off"
      >
        {remaining === null ? "--:--:--" : formatCountdown(remaining)}
      </span>
    </p>
  );
}