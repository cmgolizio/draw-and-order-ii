import type { Metadata } from "next";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";
import { DrawWorkspace } from "@/components/draw/DraftWorkspace";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_BRIEFING, type DrawBriefing } from "@/lib/draw/demoCase";

export const metadata: Metadata = {
  title: "Practice",
};

/**
 * Picks a random live suspect through the client-safe `suspects_public`
 * view (never the base table — image_path must not exist here), and signs a
 * short-lived silhouette URL with the service role. Every failure mode falls
 * back to the built-in demo case so the sketch surface always works.
 *
 * Round creation moves to POST /api/rounds in Phase 4; this briefing is the
 * Phase 3 stand-in.
 */
async function loadBriefing(): Promise<DrawBriefing> {
  try {
    const supabase = await createClient();
    const { data: suspects, error } = await supabase
      .from("suspects_public")
      .select("id, difficulty, statement, statement_teaser, silhouette_path")
      .limit(50);
    if (error || !suspects?.length) throw error ?? new Error("empty pool");

    const suspect = suspects[Math.floor(Math.random() * suspects.length)];

    let silhouetteUrl: string | null = null;
    if (suspect.silhouette_path) {
      try {
        const admin = createAdminClient();
        const { data: signed } = await admin.storage
          .from("suspect-images")
          .createSignedUrl(suspect.silhouette_path, 60 * 60);
        silhouetteUrl = signed?.signedUrl ?? null;
      } catch {
        // No service key / object missing — the demo guide covers it.
      }
    }

    return {
      source: "live",
      suspectId: suspect.id,
      difficulty: suspect.difficulty,
      statement: suspect.statement,
      statementTeaser: suspect.statement_teaser,
      silhouetteUrl,
    };
  } catch {
    return { ...DEMO_BRIEFING, silhouetteUrl: null };
  }
}

export default async function DrawPage() {
  const briefing = await loadBriefing();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <CaseFolder tab="Sketch Room" bodyClassName="p-4 sm:p-6">
        <div className="flex flex-col gap-5">
          <div>
            <TypewriterHeading as="h1" className="text-2xl sm:text-3xl">
              Practice sketch
            </TypewriterHeading>
            <p className="mt-1 max-w-prose text-sm text-ink-soft">
              Read the witness statement, then draw the suspect. Graphite
              only, detective — this precinct doesn&apos;t do color.
            </p>
          </div>
          <DrawWorkspace briefing={briefing} />
        </div>
      </CaseFolder>
    </div>
  );
}