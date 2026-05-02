const ALPHA_EVENTS = [
  "AI node #4 aggregated 1.2M points for $BTC",
  "Anomalous volume detected on $SUI across major DEXs",
  "Risk score adjusted for $SOL after network update",
  "Deep-dive analysis generated for $LINK",
  "Sentiment shifted bearish for the mid-cap AI sector",
  "Alpha engine identified divergence on $ETH structure",
];

export function AlphaTicker() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        height: "calc(var(--space-sm) * 2 + var(--text-sm) * 1.4)",
        overflow: "hidden",
        overflowX: "clip",
        borderTop: "1px solid var(--border-color)",
        borderBottom: "1px solid var(--border-color)",
        background: "rgba(10, 10, 10, 0.3)",
        position: "relative",
        contain: "strict",
        isolation: "isolate",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
          }}
        >
          <div className="ticker-track" style={{ display: "flex", gap: "3rem", width: "max-content", minWidth: "100%" }}>
            {[...ALPHA_EVENTS, ...ALPHA_EVENTS].map((event, index) => (
              <div
                key={`${event.slice(0, 20)}-${index}`}
                style={{
                  fontSize: "var(--text-sm)",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: "var(--accent-primary)" }}>[SYS]</span>
                {event}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
