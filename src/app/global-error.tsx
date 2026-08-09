"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void import("@sentry/nextjs").then((Sentry) => {
      Sentry.captureException(error);
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          background: "#07080b",
          color: "#f7f7fb",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        }}
      >
        <main
          style={{
            display: "grid",
            minHeight: "100vh",
            placeItems: "center",
            padding: "32px",
          }}
        >
          <section style={{ maxWidth: "520px" }}>
            <p
              style={{
                margin: "0 0 12px",
                color: "#ffb86b",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              TokenRadar
            </p>
            <h1 style={{ margin: "0 0 12px", fontSize: "32px", lineHeight: 1.1 }}>
              Something went wrong
            </h1>
            <p style={{ margin: "0 0 24px", color: "#c9c5d4", lineHeight: 1.6 }}>
              The error has been recorded so it can be investigated.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                border: "1px solid #4b465b",
                borderRadius: "6px",
                background: "#f7f7fb",
                color: "#07080b",
                cursor: "pointer",
                font: "inherit",
                fontWeight: 700,
                padding: "10px 14px",
              }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
