import {
  caseNumber,
  formatScore,
  TRAIT_SHARE_NAMES,
} from "@/lib/game/round-result";
import {
  OG_SIZE,
  renderResultCard,
  toCardImageSrc,
  type OgCardData,
} from "@/lib/server/og-card";
import { downloadRoundImages, getRoundResult } from "@/lib/server/rounds";

/**
 * The share card (Phase 7): suspect + sketch side by side, score stamp, case
 * number — doubles as the social share image for /results/[roundId] unfurls.
 * Unrevealed/missing rounds get a sealed card; the suspect's face never
 * appears for a round that hasn't been revealed.
 */

export const alt = "Draw & Order case report — sketch vs. suspect";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = await params;

  let data: OgCardData = { kind: "sealed" };
  try {
    const lookup = await getRoundResult(roundId);
    if (lookup.state === "revealed") {
      const { result } = lookup;
      const images = await downloadRoundImages(roundId);
      const [suspectSrc, drawingSrc] = await Promise.all([
        images?.suspectPng ? toCardImageSrc(images.suspectPng) : null,
        images?.drawingPng ? toCardImageSrc(images.drawingPng) : null,
      ]);
      data = {
        kind: "revealed",
        caseNo: caseNumber(result),
        scoreLabel: result.forfeited
          ? "Forfeited"
          : `${result.score !== null ? formatScore(result.score) : "—"} / 100`,
        forfeited: result.forfeited,
        best: result.breakdown
          ? TRAIT_SHARE_NAMES[result.breakdown.bestFeature]
          : null,
        miss: result.breakdown
          ? TRAIT_SHARE_NAMES[result.breakdown.biggestMiss]
          : null,
        suspectSrc,
        drawingSrc,
      };
    }
  } catch {
    // Storage or DB hiccup — the sealed card is always renderable.
  }

  return renderResultCard(data);
}