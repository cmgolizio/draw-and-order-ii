"use client";

/**
 * Last-resort boundary (Phase 7): replaces the root layout when it crashes,
 * so it ships its own <html>/<body> and inline styles — no Tailwind, no
 * fonts, nothing that could have been part of the crash.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#e8dcc4",
          color: "#1a1814",
          fontFamily: "Courier New, Courier, monospace",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <p
            style={{
              display: "inline-block",
              border: "3px double #b03a2e",
              color: "#8c2d24",
              padding: "0.25rem 0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              transform: "rotate(-2deg)",
              fontWeight: 700,
            }}
          >
            Precinct offline
          </p>
          <h1 style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
            The whole records room went dark
          </h1>
          <p style={{ color: "#403b31" }}>
            A serious error took the page down. Try again — if it keeps
            happening, come back later.
          </p>
          {error?.digest ? (
            <p style={{ color: "#57503f", fontSize: "0.75rem" }}>
              Incident ref: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              cursor: "pointer",
              border: "2px solid #8c2d24",
              background: "transparent",
              color: "#8c2d24",
              padding: "0.6rem 1.25rem",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              fontWeight: 700,
              fontFamily: "inherit",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}