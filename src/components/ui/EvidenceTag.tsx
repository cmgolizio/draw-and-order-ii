import { cx } from "@/lib/cx";

/** Small kraft evidence tag with a punched hole, e.g. "EXHIBIT A". */
export function EvidenceTag({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "type-label inline-flex items-center gap-2 border border-kraft-600 bg-manila-300 px-2.5 py-1 text-xs text-ink-soft shadow-sm",
        "[clip-path:polygon(8px_0,100%_0,100%_100%,8px_100%,0_50%)] pl-4",
        className,
      )}
    >
      <span
        aria-hidden
        className="size-2 rounded-full border border-kraft-700 bg-manila-50 shadow-inner"
      />
      {children}
    </span>
  );
}