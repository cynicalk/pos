"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/observability";

// Root error boundary. Renders when even the root layout throws, so it must be
// a complete document with its own <html>/<body> and self-contained styles
// (global CSS may not have loaded). Colours are inlined from the brand palette
// so a crash still looks like Cooklyt, not a raw browser error page.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { source: "global-error", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f1e8",
          color: "#101a2c",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }} aria-hidden>
            🍽️
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, color: "#3a4459", margin: "0 0 24px" }}>
            The app hit an unexpected error. Your table and cart are saved — try again.
          </p>
          <button
            onClick={reset}
            style={{
              appearance: "none",
              border: "none",
              borderRadius: 999,
              padding: "12px 28px",
              fontSize: 16,
              fontWeight: 600,
              color: "#f5f1e8",
              background: "#24365c",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
