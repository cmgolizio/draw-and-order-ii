import { Stamp } from "@/components/ui/Stamp";

/**
 * The daily streak as a stamp collection (Phase 6): one crooked stamp per
 * consecutive day, the latest inked in red. Long streaks summarize instead
 * of wallpapering the dossier.
 */
const MAX_STAMPS = 10;

export function StreakStamps({ streak }: { streak: number }) {
  if (streak <= 0) {
    return (
      <p className="text-sm text-ink-faint">
        No active streak — file a sketch on today&rsquo;s case to start one.
      </p>
    );
  }

  const shown = Math.min(streak, MAX_STAMPS);
  const firstShownDay = streak - shown + 1;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label={`Daily streak: ${streak} consecutive ${streak === 1 ? "day" : "days"}`}
    >
      {streak > shown && (
        <span className="type-label text-xs text-ink-faint">
          +{streak - shown} more ·
        </span>
      )}
      {Array.from({ length: shown }, (_, i) => {
        const day = firstShownDay + i;
        const latest = i === shown - 1;
        return (
          <Stamp
            key={day}
            color={latest ? "red" : "blue"}
            seed={`streak-day-${day}`}
            className="!px-2 !py-0.5 !text-[10px]"
          >
            Day {day}
          </Stamp>
        );
      })}
    </div>
  );
}