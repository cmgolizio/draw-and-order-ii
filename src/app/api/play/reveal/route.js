import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CASES } from "@/lib/play/cases";
// Unranked curated rounds have no user records or AI calls. No image GET route,
// public file, preload, guide, or client import can reveal the reference.
export async function POST(request) {
  const origin = request.headers.get("origin");
  if (
    origin &&
    new URL(origin).host !==
      (request.headers.get("host") || new URL(request.url).host)
  )
    return Response.json(
      { error: "Use the game to reveal a case." },
      { status: 403 },
    );
  if (Number(request.headers.get("content-length") || 0) > 2048)
    return new Response(null, { status: 413 });
  let body;
  try {
    body = z
      .object({
        id: z.enum(["moth", "maven", "teapot"]),
        finished: z.literal(true),
      })
      .parse(await request.json());
  } catch {
    return Response.json(
      { error: "Finish your sketch to reveal this case." },
      { status: 400 },
    );
  }
  const c = CASES.find((c) => c.id === body.id);
  const png = await readFile(
    path.join(process.cwd(), "content", "cases", `${c.id}.png`),
  );
  return Response.json(
    {
      name: c.name,
      reaction: c.reaction,
      features: c.features.map((f) => ({
        label: f.label,
        description: f.description,
      })),
      suspectImageUrl: `data:image/png;base64,${png.toString("base64")}`,
      score: null,
      feedback:
        "Unscored round. Compare your interpretation with the clues below.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
