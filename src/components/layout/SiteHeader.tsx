import Link from "next/link";
import { HeaderAuthLink } from "@/components/auth/HeaderAuthLink";

const NAV = [
  { href: "/draw", label: "Practice" },
  { href: "/daily", label: "Daily Case" },
  { href: "/me", label: "My File" },
] as const;

/** Top bar styled as the closed edge of a case file, site name on the tab. */
export function SiteHeader() {
  return (
    <header className="texture-grain border-b-2 border-kraft-800 bg-kraft-700 text-manila-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-paper focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-x-4 px-4 pt-3">
        <Link
          href="/"
          className="type-label relative top-0.5 rounded-t-md border border-b-0 border-kraft-800 bg-manila-200 px-4 py-2 text-sm font-bold text-ink"
        >
          Draw &amp; Order
        </Link>
        <nav
          aria-label="Primary"
          className="flex items-center gap-1 py-2 text-xs sm:gap-3 sm:text-sm"
        >
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="type-label rounded-sm px-2 py-1.5 hover:bg-manila-100/15 hover:text-manila-50"
            >
              {label}
            </Link>
          ))}
          <HeaderAuthLink className="type-label ml-1 rounded-sm border border-manila-300/70 px-2.5 py-1.5 hover:bg-manila-100/15 hover:text-manila-50" />
        </nav>
      </div>
    </header>
  );
}