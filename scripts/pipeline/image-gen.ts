/**
 * Image generation behind a swappable `generateImage(prompt)` adapter.
 *
 * Providers (selected via IMAGE_GEN_PROVIDER, key via IMAGE_GEN_API_KEY):
 *   - openai  gpt-image-1 via the REST images endpoint
 *   - fal     FLUX dev via fal.ai's synchronous run endpoint
 *   - mock    deterministic local placeholder (sharp-rendered SVG) — lets the
 *             whole pipeline run end-to-end with zero spend, and is the
 *             default when no provider is configured.
 *
 * The build plan calls for evaluating gpt-image-1 vs Flux on cost and
 * consistency during this phase; both are wired so the comparison is a
 * one-env-var switch.
 */
import sharp from "sharp";
import { fal } from "@fal-ai/client";
import type { TraitSheet } from "./traits";
import { traitSheetLines } from "./traits";

export const IMAGE_PROMPT_VERSION = "1.0.0";

/** Matches the canvas logical size (800x1040) aspect; providers get their
 *  nearest supported size and we resize to this in post. */
export const PORTRAIT_WIDTH = 800;
export const PORTRAIT_HEIGHT = 1040;

export type ImageProvider = "openai" | "fal" | "mock";

export type ImageGenerator = {
  provider: ImageProvider;
  /** Model identifier recorded in model_info. */
  model: string;
  generateImage(prompt: string): Promise<Buffer>;
};

/**
 * Trait sheet is the source of truth; the statement is flavor only and is
 * deliberately NOT included — statements omit traits by design (difficulty),
 * and the render must contain every trait so the judge has something to
 * score against.
 */
export function buildImagePrompt(traits: TraitSheet): string {
  return [
    "Fictional police booking photograph of a person who does not exist.",
    "Head-and-shoulders portrait, facing the camera straight on, neutral flat mid-gray studio background, even frontal lighting, photorealistic.",
    "Consistent framing: head centered, top of head near the top of frame, shoulders at the bottom edge.",
    "HARD CONSTRAINT: nothing covering the face — no masks, bandanas, scarves, sunglasses, or hands. The full face must be clearly visible.",
    "",
    "The person's appearance, exactly as specified:",
    ...traitSheetLines(traits),
  ].join("\n");
}

export function createImageGenerator(
  provider: ImageProvider,
  apiKey: string | undefined,
): ImageGenerator {
  switch (provider) {
    case "openai":
      if (!apiKey) throw new Error("IMAGE_GEN_API_KEY required for openai");
      return openaiGenerator(apiKey);
    case "fal":
      if (!apiKey)
        throw new Error("FAL_KEY (or IMAGE_GEN_API_KEY) required for fal");
      return falGenerator(apiKey);
    case "mock":
      return mockGenerator();
  }
}

function openaiGenerator(apiKey: string): ImageGenerator {
  return {
    provider: "openai",
    model: "gpt-image-1",
    async generateImage(prompt) {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          size: "1024x1536", // nearest portrait size; resized below
          quality: "medium",
          n: 1,
        }),
      });
      if (!res.ok) {
        throw new Error(`gpt-image-1 failed (${res.status}): ${await res.text()}`);
      }
      const json = (await res.json()) as { data: Array<{ b64_json: string }> };
      const raw = Buffer.from(json.data[0].b64_json, "base64");
      return normalize(raw);
    },
  };
}

const FAL_MODEL = "fal-ai/flux/dev";

function falGenerator(apiKey: string): ImageGenerator {
  // The client also reads FAL_KEY from the env on its own; setting credentials
  // explicitly lets the IMAGE_GEN_API_KEY fallback work too.
  fal.config({ credentials: apiKey });
  return {
    provider: "fal",
    model: FAL_MODEL,
    async generateImage(prompt) {
      // subscribe() uses the queue API (submit + poll), so slower FLUX runs
      // don't hit the synchronous-endpoint request timeout.
      const { data } = await fal.subscribe(FAL_MODEL, {
        input: {
          prompt,
          image_size: { width: 832, height: 1088 },
          num_images: 1,
          enable_safety_checker: true,
        },
      });
      const url = (data as { images?: Array<{ url: string }> }).images?.[0]?.url;
      if (!url) throw new Error("flux returned no image");
      const imageRes = await fetch(url);
      if (!imageRes.ok) {
        throw new Error(`flux image download failed (${imageRes.status})`);
      }
      const raw = Buffer.from(await imageRes.arrayBuffer());
      return normalize(raw);
    },
  };
}

/** Deterministic gray head-and-shoulders placeholder. */
function mockGenerator(): ImageGenerator {
  return {
    provider: "mock",
    model: "mock-placeholder",
    async generateImage(prompt) {
      // Vary shading a little by prompt so consecutive mocks aren't identical.
      let h = 0;
      for (const ch of prompt) h = (h * 31 + ch.charCodeAt(0)) % 9973;
      const tone = 90 + (h % 60);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PORTRAIT_WIDTH}" height="${PORTRAIT_HEIGHT}">
  <rect width="100%" height="100%" fill="rgb(170,170,170)"/>
  <ellipse cx="400" cy="430" rx="190" ry="250" fill="rgb(${tone},${tone},${tone})"/>
  <rect x="330" y="640" width="140" height="120" fill="rgb(${tone},${tone},${tone})"/>
  <path d="M 80 1040 Q 400 700 720 1040 Z" fill="rgb(${tone - 30},${tone - 30},${tone - 30})"/>
  <text x="400" y="990" text-anchor="middle" font-family="monospace" font-size="30" fill="rgb(60,60,60)">MOCK SUSPECT</text>
</svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    },
  };
}

/** Resize whatever the provider returned to the canonical portrait PNG. */
async function normalize(raw: Buffer): Promise<Buffer> {
  return sharp(raw)
    .resize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, { fit: "cover", position: "top" })
    .png()
    .toBuffer();
}