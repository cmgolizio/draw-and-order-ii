import type { Metadata } from "next";
import { caseNumber } from "@/lib/game/daily";
import { ensureProfile } from "@/lib/server/identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AnonDossier } from "@/components/me/AnonDossier";
import { HandleEditor } from "@/components/me/HandleEditor";
import { StreakStamps } from "@/components/me/StreakStamps";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { InkButton } from "@/components/ui/InkButton";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

export const metadata: Metadata = {
  title: "My File",
};

/**
 * The personnel dossier (Phase 5): stats from the user_stats RPC, round
 * history with drawing thumbnails, handle editing, sign out. Anonymous
 * visitors get the localStorage mirror plus the signup pitch — play is
 * never gated on auth.
 */

type RoundRow = {
  id: string;
  mode: "practice" | "daily";
  daily_date: string | null;
  final_score: number | null;
  revealed: boolean;
  created_at: string;
  drawing_path: string | null;
};

type Stats = {
  rounds_played: number;
  avg_score: number | null;
  best_score: number | null;
  daily_streak: number;
};

const HISTORY_LIMIT = 24;
const THUMB_URL_TTL_SECONDS = 600;

export default async function MePage() {
  let userId: string | null = null;
  let email: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    email = data.user?.email ?? null;
  } catch {
    // Supabase env missing — the anonymous dossier still works.
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <CaseFolder tab="Personnel Dossier" paperClip>
        {userId ? (
          <AuthedDossier userId={userId} email={email} />
        ) : (
          <AnonDossier />
        )}
      </CaseFolder>
    </div>
  );
}

async function AuthedDossier({
  userId,
  email,
}: {
  userId: string;
  email: string | null;
}) {
  const supabase = await createClient();

  let handle: string | null = null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("id", userId)
    .maybeSingle();
  handle = profile?.handle ?? null;
  if (!handle) {
    // First visit before any round: mint the profile row now so the dossier
    // never shows an empty name plate. Idempotent, service-role only.
    try {
      const admin = createAdminClient();
      await ensureProfile(admin, userId);
      const { data: minted } = await admin
        .from("profiles")
        .select("handle")
        .eq("id", userId)
        .maybeSingle();
      handle = minted?.handle ?? null;
    } catch {
      // Degraded (no service key): show a placeholder, editing still works.
    }
  }

  const [statsResult, roundsResult] = await Promise.all([
    supabase.rpc("user_stats", { for_user: userId }),
    supabase
      .from("rounds")
      .select(
        "id, mode, daily_date, final_score, revealed, created_at, drawing_path",
      )
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  const stats = (statsResult.data as Stats[] | null)?.[0] ?? null;
  const rounds = (roundsResult.data as RoundRow[] | null) ?? [];

  // Thumbnails are signed by the service role: claimed anonymous rounds keep
  // their anon/... paths, which the user's own storage policy can't read.
  const thumbs = new Map<string, string>();
  const paths = rounds
    .map((r) => r.drawing_path)
    .filter((p): p is string => p !== null);
  if (paths.length > 0) {
    try {
      const admin = createAdminClient();
      const { data: signed } = await admin.storage
        .from("drawings")
        .createSignedUrls(paths, THUMB_URL_TTL_SECONDS);
      for (const item of signed ?? []) {
        if (item.path && item.signedUrl && !item.error) {
          thumbs.set(item.path, item.signedUrl);
        }
      }
    } catch {
      // No thumbnails is a cosmetic loss, not a broken page.
    }
  }

  const statCards = [
    { label: "Rounds filed", value: stats ? String(stats.rounds_played) : "—" },
    {
      label: "Average score",
      value: stats?.avg_score != null ? String(stats.avg_score) : "—",
    },
    {
      label: "Best score",
      value: stats?.best_score != null ? String(stats.best_score) : "—",
    },
    { label: "Daily streak", value: stats ? String(stats.daily_streak) : "—" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Stamp color="blue">Active duty</Stamp>
          {email && (
            <span className="text-xs text-ink-faint">Badge issued to {email}</span>
          )}
        </div>
        <SignOutButton />
      </div>

      <TypewriterHeading as="h1" className="text-3xl sm:text-4xl">
        Your case record
      </TypewriterHeading>

      <HandleEditor handle={handle ?? "Det. (unassigned)"} />

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="border border-kraft-400 bg-manila-50 p-4"
          >
            <dt className="type-label text-xs text-ink-faint">{stat.label}</dt>
            <dd className="mt-1 font-typewriter text-2xl text-ink">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <section aria-label="Daily streak" className="flex flex-col gap-2">
        <h2 className="type-label text-xs text-ink-faint">Streak stamps</h2>
        <StreakStamps streak={stats?.daily_streak ?? 0} />
      </section>

      <section aria-label="Round history">
        <TypewriterHeading as="h2" className="mb-3 text-base">
          Recent cases
        </TypewriterHeading>
        {rounds.length === 0 ? (
          <div className="flex flex-col items-start gap-3 border border-dashed border-graphite-300 bg-paper p-4">
            <p className="text-sm text-ink-soft">
              Nothing on file yet, detective. Pull a case and get sketching.
            </p>
            <InkButton variant="red" href="/draw">
              Open a case
            </InkButton>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-graphite-200 border border-graphite-200 bg-paper">
            {rounds.map((round) => {
              const thumb = round.drawing_path
                ? thumbs.get(round.drawing_path)
                : undefined;
              return (
                <li
                  key={round.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  {thumb ? (
                    // Short-lived signed URL — plain img, no optimizer proxy.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      aria-hidden
                      width={40}
                      height={52}
                      className="shrink-0 border border-graphite-200 bg-paper object-cover"
                      style={{ aspectRatio: "800 / 1040" }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-[52px] w-[40px] shrink-0 items-center justify-center border border-dashed border-graphite-300 bg-manila-50 text-[9px] text-ink-faint"
                    >
                      —
                    </span>
                  )}
                  <span className="type-label min-w-0 flex-1 truncate text-xs text-ink-soft">
                    {round.mode === "daily" && round.daily_date
                      ? `Case ${caseNumber(round.daily_date)}`
                      : "Practice"}
                  </span>
                  <span className="hidden text-xs text-ink-faint sm:inline">
                    {new Date(round.created_at).toLocaleDateString()}
                  </span>
                  <span className="font-typewriter shrink-0 text-sm text-ink">
                    {round.final_score !== null
                      ? `${Math.round(Number(round.final_score) * 10) / 10} / 100`
                      : round.revealed
                        ? "Forfeited"
                        : "Open"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}