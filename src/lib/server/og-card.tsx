import "server-only";
import { ImageResponse } from "next/og";
import sharp from "sharp";

/**
 * The share-card renderer (Phase 7), separated from the route so the layout
 * is a pure function of plain data. Satori supports only flexbox and a CSS
 * subset — no grid, no `double` borders (StampBox fakes the ring by nesting).
 */

export const OG_SIZE = { width: 1200, height: 630 };

export type OgCardData =
  | { kind: "sealed" }
  | {
      kind: "revealed";
      caseNo: string;
      /** e.g. "78 / 100" — or "Forfeited" when forfeited. */
      scoreLabel: string;
      forfeited: boolean;
      best: string | null;
      miss: string | null;
      /** Data URLs (satori gets no cookies — never pass signed URLs). */
      suspectSrc: string | null;
      drawingSrc: string | null;
    };

const PALETTE = {
  manila: "#e8dcc4",
  manilaLight: "#f2ead6",
  kraft: "#957648",
  ink: "#1a1814",
  inkSoft: "#403b31",
  stampRed: "#b03a2e",
  stampBlue: "#2f5d8a",
  paper: "#fbf9f4",
};

/** Portrait tile size inside the card (800x1040 aspect). */
const PHOTO = { width: 300, height: 390 };

let typewriterFont: ArrayBuffer | null | undefined;

/** Best-effort Special Elite; the card falls back to the default font. */
async function loadTypewriterFont(): Promise<ArrayBuffer | null> {
  if (typewriterFont !== undefined) return typewriterFont;
  try {
    const css = await (
      await fetch("https://fonts.googleapis.com/css2?family=Special+Elite", {
        headers: { "User-Agent": "curl/8" }, // plain UA -> ttf sources
      })
    ).text();
    const url = css.match(/src:\s*url\((.+?)\)\s*format\(['"]?truetype/)?.[1];
    typewriterFont = url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    typewriterFont = null;
  }
  return typewriterFont;
}

/** Downscale a stored PNG to a compact JPEG data URL for the card. */
export async function toCardImageSrc(png: ArrayBuffer): Promise<string> {
  const jpeg = await sharp(Buffer.from(png))
    .resize(PHOTO.width * 2, PHOTO.height * 2, { fit: "cover" })
    .jpeg({ quality: 72 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

function StampBox({
  color,
  fontSize,
  tilt,
  align = "flex-start",
  children,
}: {
  color: string;
  fontSize: number;
  tilt: string;
  align?: "flex-start" | "center";
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: align,
        border: `5px solid ${color}`,
        padding: 4,
        transform: `rotate(${tilt})`,
      }}
    >
      <div
        style={{
          display: "flex",
          border: `2px solid ${color}`,
          color,
          padding: "8px 24px",
          fontSize,
          letterSpacing: 5,
          textTransform: "uppercase",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function EvidencePhoto({
  src,
  label,
  tilt,
}: {
  src: string | null;
  label: string;
  tilt: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: PALETTE.paper,
        padding: 10,
        paddingBottom: 6,
        boxShadow: "0 12px 28px rgba(26,24,20,0.35)",
        transform: `rotate(${tilt})`,
      }}
    >
      {src ? (
        // Satori JSX, not the DOM — next/image does not apply here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          width={PHOTO.width}
          height={PHOTO.height}
          alt=""
          style={{ objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: PHOTO.width,
            height: PHOTO.height,
            backgroundColor: PALETTE.manilaLight,
            color: PALETTE.inkSoft,
            fontSize: 22,
            textTransform: "uppercase",
            letterSpacing: 3,
          }}
        >
          not on file
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          paddingTop: 8,
          fontSize: 20,
          color: PALETTE.inkSoft,
          textTransform: "uppercase",
          letterSpacing: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export async function renderResultCard(data: OgCardData): Promise<ImageResponse> {
  const fontData = await loadTypewriterFont();
  const fonts = fontData
    ? [
        {
          name: "Special Elite",
          data: fontData,
          weight: 400 as const,
          style: "normal" as const,
        },
      ]
    : undefined;

  const frame = (children: React.ReactNode) => (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        backgroundColor: PALETTE.manila,
        border: `14px solid ${PALETTE.kraft}`,
        fontFamily: fontData ? "Special Elite" : undefined,
        color: PALETTE.ink,
      }}
    >
      {children}
    </div>
  );

  if (data.kind === "sealed") {
    return new ImageResponse(
      frame(
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            gap: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 72,
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            Draw &amp; Order
          </div>
          <StampBox color={PALETTE.stampBlue} fontSize={44} tilt="-4deg" align="center">
            Case sealed
          </StampBox>
          <div style={{ display: "flex", fontSize: 26, color: PALETTE.inkSoft }}>
            The AI police-sketch game
          </div>
        </div>,
      ),
      { ...OG_SIZE, fonts },
    );
  }

  return new ImageResponse(
    frame(
      <>
        {/* Evidence photos */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: "0 36px",
          }}
        >
          <EvidencePhoto src={data.suspectSrc} label="Suspect" tilt="-2deg" />
          <EvidencePhoto src={data.drawingSrc} label="Sketch" tilt="1.5deg" />
        </div>

        {/* Report column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flexGrow: 1,
            gap: 20,
            paddingRight: 36,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 38,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            Draw &amp; Order
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: PALETTE.inkSoft,
              letterSpacing: 2,
            }}
          >
            Case {data.caseNo}
          </div>
          <StampBox
            color={data.forfeited ? PALETTE.stampBlue : PALETTE.stampRed}
            fontSize={data.forfeited ? 38 : 46}
            tilt="-3deg"
          >
            {data.scoreLabel}
          </StampBox>
          {(data.best || data.miss) && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 26,
                color: PALETTE.inkSoft,
              }}
            >
              {data.best && <div style={{ display: "flex" }}>Best: {data.best}</div>}
              {data.miss && <div style={{ display: "flex" }}>Miss: {data.miss}</div>}
            </div>
          )}
          <div
            style={{
              display: "flex",
              fontSize: 20,
              color: PALETTE.kraft,
              letterSpacing: 1,
            }}
          >
            The AI police-sketch game
          </div>
        </div>
      </>,
    ),
    { ...OG_SIZE, fonts },
  );
}