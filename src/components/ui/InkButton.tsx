import Link from "next/link";
import { cx } from "@/lib/cx";

const VARIANTS = {
  red: "border-stamp-red-deep text-stamp-red-deep hover:bg-stamp-red/10",
  blue: "border-stamp-blue-deep text-stamp-blue-deep hover:bg-stamp-blue/10",
  ink: "border-ink-soft text-ink-soft hover:bg-ink/5",
} as const;

type CommonProps = {
  variant?: keyof typeof VARIANTS;
  className?: string;
  children: React.ReactNode;
};

type AsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
    href?: undefined;
  };

type AsLink = CommonProps & { href: string };

/**
 * Button styled like a rubber stamp — pressing it should feel like stamping
 * a form. Renders a Next <Link> when given an href.
 */
export function InkButton(props: AsButton | AsLink) {
  const { variant = "ink", className, children, ...rest } = props;
  const cls = cx(
    "type-label inline-flex cursor-pointer items-center justify-center gap-2 border-2 bg-transparent px-5 py-2.5 text-sm font-bold select-none",
    "transition-[transform,background-color] duration-75 motion-reduce:transition-none",
    "active:translate-y-px active:scale-[0.97] active:shadow-pressed",
    VARIANTS[variant],
    className,
  );

  if (typeof rest.href === "string") {
    return (
      <Link href={rest.href} className={cls}>
        {children}
      </Link>
    );
  }

  return (
    <button className={cls} {...(rest as Omit<AsButton, keyof CommonProps>)}>
      {children}
    </button>
  );
}