"use client";

import Link from "next/link";

export default function TikTokCallbackPage() {
  const params = typeof window === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
  const code = params.get("code") || "";
  const state = params.get("state") || "";
  const error = params.get("error") || params.get("error_description") || "";

  return (
    <main className="container">
      <section className="section">
        <div className="article-content">
          <h1>TikTok Authorization</h1>
          {error ? (
            <>
              <p>TikTok returned an authorization error.</p>
              <pre>{error}</pre>
            </>
          ) : code ? (
            <>
              <p>Authorization completed. Use this code in the local token helper:</p>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {`npx tsx scripts/generate-tiktok-token.ts --code ${code}`}
              </pre>
              {state ? <p style={{ color: "var(--text-muted)" }}>State: {state}</p> : null}
            </>
          ) : (
            <p>No TikTok authorization code was found in this URL.</p>
          )}
          <p>
            <Link href="/">Return to TokenRadar</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
