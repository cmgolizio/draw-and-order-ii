"use client";

/**
 * Sound on/off (Phase 7) — muted by default. Rendered in the drawing toolbar
 * and on the results page next to the reveal.
 */
import { cx } from "@/lib/cx";
import { setSoundEnabled, useSoundEnabled } from "@/lib/sound";

export function SoundToggle({ className }: { className?: string }) {
  const enabled = useSoundEnabled();
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={() => setSoundEnabled(!enabled)}
      title="Pencil scratch and stamp thud — off by default"
      className={cx(
        "type-label cursor-pointer border px-2.5 py-1.5 text-xs transition-colors",
        enabled
          ? "border-ink bg-ink text-paper"
          : "border-graphite-300 bg-paper text-ink-soft hover:bg-manila-50",
        className,
      )}
    >
      {enabled ? "Sound on" : "Sound off"}
    </button>
  );
}