import { cx } from "@/lib/cx";
import { PaperClip } from "@/components/ui/motifs";

/**
 * Manila folder container: labeled tab up top, worn kraft edge, paper grain.
 */
export function CaseFolder({
  tab,
  paperClip = false,
  children,
  className,
  bodyClassName,
}: {
  /** Label rendered on the folder tab. */
  tab?: React.ReactNode;
  paperClip?: boolean;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("relative", className)}>
      {tab != null && (
        <div className="type-label relative z-0 ml-5 inline-block rounded-t-md border border-b-0 border-kraft-500 bg-manila-300 px-4 pt-1.5 pb-2 text-xs text-ink-soft">
          {tab}
        </div>
      )}
      <div
        className={cx(
          "texture-grain relative rounded-md border border-kraft-500 bg-manila-100 shadow-folder",
          tab != null && "-mt-1 rounded-tl-none",
          bodyClassName ?? "p-6 sm:p-8",
        )}
      >
        {paperClip && <PaperClip />}
        {children}
      </div>
    </section>
  );
}