"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function TikTokCallbackPage() {
  const [code, setCode] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCode(params.get("code") || "");
    setState(params.get("state") || "");
    setError(params.get("error") || params.get("error_description") || "");
  }, []);

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

