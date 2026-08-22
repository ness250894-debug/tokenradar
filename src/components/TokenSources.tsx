interface TokenSourceLinks {
  website: string | null;
  github: string | null;
  explorer: string | null;
  reddit: string | null;
}

export interface TokenSourceItem {
  label: string;
  href: string;
}

function normalizeExternalUrl(value: string | null): string | null {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function buildTokenSourceLinks(tokenId: string, links: TokenSourceLinks): TokenSourceItem[] {
  const candidates = [
    { label: "Official website", href: normalizeExternalUrl(links.website) },
    { label: "GitHub repository", href: normalizeExternalUrl(links.github) },
    { label: "Block explorer", href: normalizeExternalUrl(links.explorer) },
    { label: "Reddit community", href: normalizeExternalUrl(links.reddit) },
  ];
  const normalizedTokenId = tokenId.trim();
  if (normalizedTokenId) {
    candidates.push({
      label: "CoinGecko market page",
      href: `https://www.coingecko.com/en/coins/${encodeURIComponent(normalizedTokenId)}`,
    });
  }

  return candidates.filter((source): source is TokenSourceItem => Boolean(source.href));
}

export function formatSnapshotDate(value: string): { dateTime: string; label: string } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    dateTime: date.toISOString(),
    label: date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}

export function TokenSources({
  tokenId,
  links,
  fetchedAt,
}: {
  tokenId: string;
  links: TokenSourceLinks;
  fetchedAt: string;
}) {
  const sources = buildTokenSourceLinks(tokenId, links);
  const snapshotDate = formatSnapshotDate(fetchedAt);

  if (sources.length === 0 && !snapshotDate) return null;

  return (
    <aside
      className="card"
      aria-labelledby={`sources-${tokenId}`}
      style={{ marginTop: "var(--space-xl)", padding: "var(--space-xl)" }}
    >
      <h2 id={`sources-${tokenId}`} style={{ fontSize: "var(--text-xl)", fontWeight: 800 }}>
        Sources &amp; verification
      </h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: "var(--space-sm)" }}>
        Verify project identity, network details, and the market snapshot against primary and third-party records.
      </p>
      <ul style={{ marginTop: "var(--space-md)", display: "grid", gap: "var(--space-sm)" }}>
        {sources.map((source) => (
          <li key={`${source.label}-${source.href}`}>
            <a href={source.href} target="_blank" rel="noopener noreferrer">
              {source.label}
            </a>
          </li>
        ))}
        {snapshotDate ? (
          <li>
            Market data snapshot: <time dateTime={snapshotDate.dateTime}>{snapshotDate.label}</time>
          </li>
        ) : null}
      </ul>
    </aside>
  );
}
