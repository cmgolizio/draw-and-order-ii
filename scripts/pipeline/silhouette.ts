/**
 * Silhouette pre-render (sharp) — v1 built this client-side FROM the actual
 * suspect image, leaking it pre-reveal. Here it runs in the pipeline and only
 * the rendered guide is ever served.
 *
 * Method (port of v1's brightness threshold): grayscale + slight blur, then
 * every pixel darker than the threshold becomes soft ink, everything else
 * transparent. The result is a shape guide, not a recognizable face.
 */
import sharp from "sharp";
import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH } from "./image-gen";

export const SILHOUETTE_VERSION = "1.0.0";

/** 0-255 luminance cutoff; the studio background is deliberately mid-gray so
 *  the subject (hair, features, clothing) lands below it. */
const DEFAULT_THRESHOLD = 150;

/** Ink color of the rendered silhouette (graphite, matches the theme). */
const INK = { r: 26, g: 24, b: 20 };

export async function renderSilhouette(
  imagePng: Buffer,
  threshold = DEFAULT_THRESHOLD,
): Promise<Buffer> {
  const { data, info } = await sharp(imagePng)
    .resize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, { fit: "cover" })
    .grayscale()
    .blur(2)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = info.width * info.height;
  const rgba = Buffer.alloc(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    const lum = data[i * info.channels];
    const out = i * 4;
    if (lum < threshold) {
      // Softer alpha near the cutoff so edges aren't jagged.
      const edge = Math.min(1, (threshold - lum) / 40);
      rgba[out] = INK.r;
      rgba[out + 1] = INK.g;
      rgba[out + 2] = INK.b;
      rgba[out + 3] = Math.round(200 * edge);
    }
    // else: leave fully transparent
  }

  return sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}