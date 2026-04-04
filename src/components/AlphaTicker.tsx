"use client";

import { useEffect, useState } from "react";

const ALPHA_EVENTS = [
  "🤖 AI Node #4 aggregated 1.2M points for $BTC",
  "📈 Anomalous volume detected on $SUI across major DEXs",
  "⚡ Risk Score adjusted for $SOL after network update",
  "🕵️ Deep dive analysis generated for $LINK",
  "⚠️ Sentiment shifted to 'Bearish' for mid-cap AI sector",
  "🤖 Alpha engine identified divergence on $ETH structure"
];

export function AlphaTicker() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div
      style={{
        width: "100%",
        overflow: "hidden",
        borderTop: "1px solid var(--border-color)",
        borderBottom: "1px solid var(--border-color)",
        background: "rgba(10, 10, 10, 0.3)",
        padding: "var(--space-sm) 0",
        whiteSpace: "nowrap",
        display: "flex",
      }}
    >
      <div className="ticker-track" style={{ display: "flex", gap: "3rem" }}>
        {/* We output twice to create a seamless infinite loop */}
        {[...ALPHA_EVENTS, ...ALPHA_EVENTS].map((event, i) => (
          <div
            key={i}
            style={{
              fontSize: "var(--text-sm)",
              fontFamily: "var(--font-mono)",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ color: "var(--accent-primary)" }}>[SYS]</span>
            {event}
          </div>
        ))}
      </div>
    </div>
  );
}
