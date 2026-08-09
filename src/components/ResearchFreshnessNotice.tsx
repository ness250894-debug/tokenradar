import Link from "next/link";

interface ResearchFreshnessNoticeProps {
  contentUpdatedAt: string;
  marketDataAt?: string | null;
  evidenceCheckedAt?: string | null;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function ResearchFreshnessNotice({
  contentUpdatedAt,
  marketDataAt,
  evidenceCheckedAt,
}: ResearchFreshnessNoticeProps) {
  const contentDate = formatDate(contentUpdatedAt);
  const marketDate = formatDate(marketDataAt);
  const evidenceDate = formatDate(evidenceCheckedAt);
  if (!contentDate && !marketDate && !evidenceDate) return null;

  return (
    <aside
      aria-label="Research freshness"
      style={{
        marginBottom: "var(--space-lg)",
        padding: "var(--space-md)",
        border: "1px solid var(--border-color)",
        borderLeft: "3px solid var(--accent-secondary)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-card)",
        color: "var(--text-secondary)",
        fontSize: "var(--text-sm)",
        lineHeight: 1.65,
      }}
    >
      <strong style={{ color: "var(--text-primary)" }}>Research snapshot.</strong>{" "}
      {contentDate ? <>Article reviewed <time dateTime={contentUpdatedAt}>{contentDate}</time>. </> : null}
      {marketDate ? <>Market fields fetched <time dateTime={marketDataAt || undefined}>{marketDate}</time>. </> : null}
      {evidenceDate ? <>Launch evidence checked <time dateTime={evidenceCheckedAt || undefined}>{evidenceDate}</time>. </> : null}
      Prices, availability, and launch status can change; time-sensitive wording applies to these snapshot dates.
      <span style={{ display: "block", marginTop: "var(--space-xs)" }}>
        Editorial owner: <Link href="/authors/pavlo-nakonechnyi">Pavlo Nakonechnyi</Link> ·{" "}
        <Link href="/about#methodology">Research methodology</Link>
      </span>
    </aside>
  );
}
