import { cx } from "@/lib/cx";

const COLORS = {
  red: "border-stamp-red text-stamp-red-deep",
  blue: "border-stamp-blue text-stamp-blue-deep",
  ink: "border-ink-soft text-ink-soft",
} as const;

/**
 * Deterministic rotation jitter so a stamp always lands slightly crooked —
 * derived from the label so server and client render identically.
 */
function jitterDegrees(seed: string): number {
  let h = 7;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return ((h % 9) - 4) * 0.75; // −3° … +3°
}

export function Stamp({
  children,
  color = "red",
  seed,
  className,
}: {
  children: React.ReactNode;
  color?: keyof typeof COLORS;
  /** Overrides the jitter seed when children isn't a plain string. */
  seed?: string;
  className?: string;
}) {
  const label = seed ?? (typeof children === "string" ? children : "stamp");
  return (
    <span
      className={cx(
        "type-label inline-block border-3 border-double px-3 py-1 text-sm font-bold",
        "[mask-image:radial-gradient(140%_120%_at_30%_30%,black_55%,rgb(0_0_0/0.72))]",
        COLORS[color],
        className,
      )}
      style={{ transform: `rotate(${jitterDegrees(label)}deg)` }}
    >
      {children}
    </span>
  );
}