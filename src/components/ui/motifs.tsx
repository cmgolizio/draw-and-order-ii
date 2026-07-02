import { cx } from "@/lib/cx";

/** Translucent strip of tape, for pinning things to folders. Decorative. */
export function Tape({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "pointer-events-none absolute -top-3 left-1/2 h-6 w-24 -translate-x-1/2 -rotate-2",
        "bg-manila-50/60 shadow-sm",
        className,
      )}
    />
  );
}

/** Wire paperclip hooked over the top edge of a sheet. Decorative. */
export function PaperClip({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 60"
      className={cx(
        "pointer-events-none absolute -top-4 right-6 h-14 w-6 text-graphite-400 drop-shadow-sm",
        className,
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M7 14 v32 a5 5 0 0 0 10 0 V10 a7 7 0 0 0 -14 0 v30" />
    </svg>
  );
}