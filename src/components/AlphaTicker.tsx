const ALPHA_EVENTS = [
  "Market registry refreshed from CoinGecko-backed snapshots",
  "Risk scores combine volatility, drawdown, liquidity, and trend signals",
  "Launch records require evidence before graduating from the watchlist",
  "Research drafts are checked against structured token data",
  "TokenRadar research is informational and not financial advice",
  "Full token search and filters live in the dedicated token directory",
];

export function AlphaTicker() {
  const tickerEvents = [...ALPHA_EVENTS, ...ALPHA_EVENTS];
  const tickerLabel = `TokenRadar system updates: ${ALPHA_EVENTS.join(". ")}`;

  return (
    <div
      className="alpha-ticker"
      data-nosnippet
      role="note"
      aria-label={tickerLabel}
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
      <div className="alpha-ticker-track" aria-hidden="true">
        {tickerEvents.map((event, index) => (
          <span className="alpha-ticker-item" key={`${event}-${index}`}>
            <span className="alpha-ticker-tag">[SYS]</span>
            <span className="alpha-ticker-text">{event}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
