const ALPHA_EVENTS = [
  "AI node #4 aggregated 1.2M points for $BTC",
  "Anomalous volume detected on $SUI across major DEXs",
  "Risk score adjusted for $SOL after network update",
  "Deep-dive analysis generated for $LINK",
  "Sentiment shifted bearish for the mid-cap AI sector",
  "Alpha engine identified divergence on $ETH structure",
];

export function AlphaTicker() {
  const duration = ALPHA_EVENTS.length * 4;

  return (
    <div
      className="alpha-ticker"
      style={{
        width: "100%",
        maxWidth: "100%",
        height: "calc(var(--space-sm) * 2 + var(--text-sm) * 1.4)",
        overflow: "hidden",
        overflowX: "clip",
        borderTop: "1px solid var(--border-color)",
        borderBottom: "1px solid var(--border-color)",
        background: "rgba(10, 10, 10, 0.3)",
        contain: "strict",
        isolation: "isolate",
      }}
    >
      {ALPHA_EVENTS.map((event, index) => (
        <div
          className="alpha-ticker-item"
          key={event}
          style={{
            animationDelay: `${index * 4}s`,
            animationDuration: `${duration}s`,
          }}
        >
          <span style={{ color: "var(--accent-primary)", flex: "0 0 auto" }}>[SYS]</span>
          <span className="alpha-ticker-text">{event}</span>
        </div>
      ))}
    </div>
  );
}
