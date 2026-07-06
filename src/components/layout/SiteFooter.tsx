import { ConsentNoticeLink } from "@/components/layout/ConsentNotice";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-kraft-500/60 bg-manila-300/60">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-xs text-ink-soft sm:flex-row sm:items-center sm:justify-between">
        <p className="type-label">Case files · Precinct of the Armchair</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            Every suspect is a fictional face. For entertainment purposes only.
          </span>
          <ConsentNoticeLink className="type-label cursor-pointer underline underline-offset-2 hover:text-ink" />
        </p>
      </div>
    </footer>
  );
}