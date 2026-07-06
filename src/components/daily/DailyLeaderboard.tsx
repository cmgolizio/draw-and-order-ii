"use client";

/**
 * The daily leaderboard (Phase 6): top 20 plus the viewer's own rank, with
 * Today/Yesterday tabs and load-more pagination. Handles only — no avatars,
 * no links, no moderation surface. Boards cache per date, so tab flips are
 * instant after the first visit.
 */
import { useCallback, useEffect, useState } from "react";
import { cx } from "@/lib/cx";
import { peekAnonId } from "@/lib/game/anon-id";
import type {
  DailyLeaderboardResponse,
  LeaderboardEntry,
} from "@/lib/game/api-types";
import {
  caseNumber,
  utcDateString,
  utcYesterdayString,
} from "@/lib/game/daily";
import { InkButton } from "@/components/ui/InkButton";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

type Tab = "today" | "yesterday";

type BoardState = {
  entries: LeaderboardEntry[];
  viewer: DailyLeaderboardResponse["viewer"];
  hasMore: boolean;
};

export function DailyLeaderboard() {
  const [tab, setTab] = useState<Tab>("today");
  const [boards, setBoards] = useState<Record<string, BoardState | "failed">>(
    {},
  );
  const [busy, setBusy] = useState(false);

  const date = tab === "today" ? utcDateString() : utcYesterdayString();
  const board = boards[date];

  // Promise-chained (not async) so all setState happens in callbacks — this
  // runs from the effect below and the effect body must stay pure.
  const load = useCallback((forDate: string, offset: number): Promise<void> => {
    const anonId = peekAnonId();
    const params = new URLSearchParams({
      date: forDate,
      offset: String(offset),
    });
    if (anonId) params.set("anonId", anonId);
    return fetch(`/api/daily/leaderboard?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`leaderboard ${res.status}`);
        const data = (await res.json()) as DailyLeaderboardResponse;
        setBoards((prev) => {
          const existing = prev[forDate];
          const carried =
            offset > 0 && existing && existing !== "failed"
              ? existing.entries
              : [];
          return {
            ...prev,
            [forDate]: {
              entries: [...carried, ...data.entries],
              viewer: data.viewer,
              hasMore: data.hasMore,
            },
          };
        });
      })
      .catch(() => {
        setBoards((prev) => ({ ...prev, [forDate]: "failed" }));
      });
  }, []);

  useEffect(() => {
    if (boards[date] === undefined) void load(date, 0);
  }, [boards, date, load]);

  async function loadMore() {
    if (!board || board === "failed") return;
    setBusy(true);
    await load(date, board.entries.length);
    setBusy(false);
  }

  function retry() {
    setBoards((prev) => {
      const next = { ...prev };
      delete next[date];
      return next; // the effect refetches the now-missing board
    });
  }

  const entries = board && board !== "failed" ? board.entries : [];
  const viewer = board && board !== "failed" ? board.viewer : null;
  const viewerOnBoard =
    viewer !== null && entries.some((entry) => entry.rank === viewer.rank);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TypewriterHeading as="h2" className="text-xl">
          Precinct rankings
        </TypewriterHeading>
        <div role="tablist" aria-label="Leaderboard day" className="flex gap-1">
          {(["today", "yesterday"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={tab === option}
              onClick={() => setTab(option)}
              className={cx(
                "type-label cursor-pointer border px-3 py-1.5 text-xs",
                tab === option
                  ? "border-ink bg-ink text-paper"
                  : "border-graphite-300 bg-paper text-ink-soft hover:bg-manila-50",
              )}
            >
              {option === "today" ? "Today" : "Yesterday"}
            </button>
          ))}
        </div>
      </div>

      <p className="type-label text-xs text-ink-faint">
        Case {caseNumber(date)}
      </p>

      {board === undefined && (
        <p className="type-label animate-pulse py-6 text-sm text-ink-faint">
          Pinning up the rankings…
        </p>
      )}

      {board === "failed" && (
        <div className="flex flex-col items-start gap-3 border border-stamp-red-deep/40 bg-paper p-4">
          <p role="alert" className="text-sm text-stamp-red-deep">
            The board fell off the wall. Try again.
          </p>
          <InkButton variant="ink" onClick={retry}>
            Rehang it
          </InkButton>
        </div>
      )}

      {board !== undefined && board !== "failed" && entries.length === 0 && (
        <p className="border border-dashed border-graphite-300 bg-paper p-4 text-sm text-ink-soft">
          No sketches filed on this case yet — the board is clean.
        </p>
      )}

      {entries.length > 0 && (
        <ol className="flex flex-col divide-y divide-graphite-200 border border-graphite-200 bg-paper">
          {entries.map((entry) => {
            const isViewer = viewer?.rank === entry.rank;
            return (
              <li
                key={entry.rank}
                className={cx(
                  "flex items-center gap-3 px-3 py-2 text-sm",
                  isViewer && "bg-manila-50",
                )}
              >
                <span className="font-typewriter w-10 shrink-0 text-right text-ink-faint">
                  #{entry.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">
                  {entry.handle}
                  {isViewer && (
                    <span className="type-label ml-2 text-[10px] text-stamp-blue-deep">
                      You
                    </span>
                  )}
                </span>
                <span className="font-typewriter shrink-0 text-ink">
                  {entry.score}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {viewer && !viewerOnBoard && (
        <p className="border border-stamp-blue/40 bg-paper px-3 py-2 text-sm text-ink-soft">
          <span className="type-label mr-2 text-[10px] text-stamp-blue-deep">
            Your rank
          </span>
          <span className="font-typewriter">
            #{viewer.rank} · {viewer.score} / 100
          </span>
        </p>
      )}

      {board !== undefined && board !== "failed" && board.hasMore && (
        <InkButton
          variant="ink"
          onClick={loadMore}
          disabled={busy}
          className="self-start"
        >
          {busy ? "Unpinning…" : "Show more"}
        </InkButton>
      )}
    </div>
  );
}