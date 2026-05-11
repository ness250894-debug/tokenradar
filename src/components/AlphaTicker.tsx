const ALPHA_EVENTS = [
  "Market registry refreshed from CoinGecko-backed snapshots",
  "Risk scores combine volatility, drawdown, liquidity, and trend signals",
  "Launch records require evidence before graduating from the watchlist",
  "Research drafts are checked against structured token data",
  "TokenRadar research is informational and not financial advice",
  "Full token search and filters live in the dedicated token directory",
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
