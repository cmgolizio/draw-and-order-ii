import { z } from "zod";
import { curatedBrief } from "@/lib/play/cases";
export async function GET(request) {
  const url = new URL(request.url);
  const parsed = z
    .object({
      index: z.coerce.number().int().min(0).max(100000).default(0),
      mode: z.enum(["practice", "daily"]).default("practice"),
    })
    .safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success)
    return Response.json({ error: "Unknown case." }, { status: 400 });
  return Response.json(curatedBrief(parsed.data.index, parsed.data.mode), {
    headers: { "Cache-Control": "no-store" },
  });
}
