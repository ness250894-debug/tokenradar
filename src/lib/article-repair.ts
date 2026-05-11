import { normalizeArticleMarkdown } from "./article-formatting";
import { shouldUnwrapAmbiguousTokenLink } from "./internal-link-policy";

interface TokenArticleContext {
  tokenName: string;
  symbol: string;
}

const EXCHANGE_NAME_PATTERN =
  /\b(?:Binance|Coinbase|Bybit|Kraken|OKX|KuCoin|Gate\.io|MEXC|Bitget|Upbit|WhiteBIT|BitMart)\b/i;

const VENUE_CLAIM_PATTERN =
  /\b(?:listed|listing|listings|lists|available|traded|trading|supported|offers|access|exchange|exchanges|venue|venues|cex|dex|market|markets|pair|pairs|liquidity|fees)\b/i;

const VENUE_SECTION_HEADING_PATTERN =
  /^##\s+(?:where to|top exchange|exchange availability|availability and access|where to access|choosing an exchange|choose an exchange|selecting an exchange|acquisition strategy|market availability|exchange access|where can you buy|where to purchase)\b/i;

function normalizeInternalPath(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const pathOnly = trimmed.split(/[?#]/)[0].replace(/\/+$/, "");
  return pathOnly || "/";
}

export function unwrapAmbiguousInternalArticleLinks(content: string): string {
  return content.replace(/(^|[^!])\[([^\]]+)\]\((\/[^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (match, prefix, label, href) => {
    const internalPath = normalizeInternalPath(href);
    if (!internalPath || !shouldUnwrapAmbiguousTokenLink(label, internalPath)) {
      return match;
    }

    return `${prefix}${label}`;
  });
}

function buildMarketAvailabilitySection(context: TokenArticleContext): string {
  const symbol = context.symbol.toUpperCase();

  return [
    `## Market Availability Checks for ${symbol}`,
    "",
    `Before depositing funds, verify current ${symbol} market availability directly in the exchange or DEX interface. Listings, liquidity, regional access, and withdrawal networks change over time, so treat venue availability as something to confirm at the point of purchase.`,
    "",
    "Use this checklist before placing an order:",
    "",
    `- Search for the exact ${symbol} ticker and ${context.tokenName} name.`,
    "- Confirm the trading pair, contract address, and network.",
    "- Compare spread, volume, withdrawal fees, and minimum order size.",
    "- Send a small test withdrawal before moving a larger balance.",
  ].join("\n");
}

function buildVenueVerificationLine(context: TokenArticleContext): string {
  const symbol = context.symbol.toUpperCase();
  return `Verify current ${symbol} market availability, liquidity, fees, withdrawal networks, and regional access directly with the venue before depositing funds.`;
}

function neutralizeResidualVenueClaimLines(content: string, context: TokenArticleContext): string {
  const question = `**How should I verify ${context.symbol.toUpperCase()} market availability?**`;
  const answer = buildVenueVerificationLine(context);

  return content
    .split("\n")
    .map((line) => {
      const listPrefix = line.match(/^(\s*(?:[-*]|\d+\.)\s*)/)?.[1] || "";
      if (!EXCHANGE_NAME_PATTERN.test(line)) return line;
      if (!line.includes("?") && !listPrefix && !VENUE_CLAIM_PATTERN.test(line)) {
        return line;
      }

      if (line.includes("?")) {
        return `${listPrefix}${question}`;
      }

      return `${listPrefix}${answer}`;
    })
    .join("\n");
}

function isVenueClaimSection(section: string): boolean {
  const heading = section.match(/^##\s+.+$/m)?.[0] || "";
  if (/^##\s+faq\b/i.test(heading)) return false;
  if (VENUE_SECTION_HEADING_PATTERN.test(heading)) return true;

  return EXCHANGE_NAME_PATTERN.test(section) && VENUE_CLAIM_PATTERN.test(section);
}

export function neutralizeHowToBuyVenueClaims(content: string, context: TokenArticleContext): string {
  const normalized = normalizeArticleMarkdown(content);
  const sections = [...normalized.matchAll(/^##\s+.+$/gm)];
  if (sections.length === 0) return neutralizeResidualVenueClaimLines(normalized, context);

  let next = "";
  let cursor = 0;
  let replaced = false;

  for (let index = 0; index < sections.length; index++) {
    const start = sections[index].index ?? 0;
    const end = sections[index + 1]?.index ?? normalized.length;
    next += normalized.slice(cursor, start);

    const section = normalized.slice(start, end).trim();
    if (!replaced && isVenueClaimSection(section)) {
      next += buildMarketAvailabilitySection(context);
      replaced = true;
    } else if (replaced && isVenueClaimSection(section)) {
      next = next.trimEnd();
    } else {
      next += section;
    }

    cursor = end;
    if (cursor < normalized.length) next += "\n\n";
  }

  next += normalized.slice(cursor);
  return normalizeArticleMarkdown(neutralizeResidualVenueClaimLines(next, context));
}

export function repairArticleMarkdown(
  content: string,
  articleType: string,
  context?: TokenArticleContext,
): string {
  if (articleType !== "how-to-buy" || !context) {
    return unwrapAmbiguousInternalArticleLinks(content);
  }

  const base = neutralizeHowToBuyVenueClaims(content, context);
  return normalizeArticleMarkdown(unwrapAmbiguousInternalArticleLinks(base));
}
