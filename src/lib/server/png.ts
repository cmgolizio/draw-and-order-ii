import "server-only";

/**
 * Minimal PNG header validation (Phase 4: "PNG only, dimensions validated
 * server-side") — checks the 8-byte signature and reads width/height from
 * the IHDR chunk, which the spec fixes at bytes 8..24. No image library
 * needed just to validate an upload.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function readPngDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }
  // Bytes 12..16 must name the first chunk IHDR.
  if (
    bytes[12] !== 0x49 || // I
    bytes[13] !== 0x48 || // H
    bytes[14] !== 0x44 || // D
    bytes[15] !== 0x52 // R
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}