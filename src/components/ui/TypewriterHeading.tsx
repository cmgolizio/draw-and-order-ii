import { cx } from "@/lib/cx";

/** Case-file heading set in the typewriter face. */
export function TypewriterHeading({
  as: Tag = "h2",
  children,
  className,
}: {
  as?: "h1" | "h2" | "h3" | "h4";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tag
      className={cx(
        "font-typewriter tracking-wide text-ink uppercase",
        className,
      )}
    >
      {children}
    </Tag>
  );
}