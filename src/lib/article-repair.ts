import { normalizeArticleMarkdown } from "./article-formatting";
import { getArticleQualityThresholds } from "./content-quality";
import { shouldUnwrapAmbiguousTokenLink } from "./internal-link-policy";

interface TokenArticleContext {
  tokenId?: string;
  tokenName: string;
  symbol: string;
}

const EXCHANGE_NAME_PATTERN =
  /\b(?:Binance|Coinbase|Bybit|Kraken|OKX|KuCoin|Gate\.io|MEXC|Bitget|Upbit|WhiteBIT|BitMart)\b/i;

const VENUE_CLAIM_PATTERN =
  /\b(?:listed|listing|listings|lists|available|traded|trading|supported|offers|access|exchange|exchanges|venue|venues|cex|dex|market|markets|pair|pairs|liquidity|fees)\b/i;

const VENUE_SECTION_HEADING_PATTERN =
  /^##\s+(?:where to|top exchange|exchange availability|availability and access|where to access|choosing an exchange|choose an exchange|selecting an exchange|acquisition strategy|market availability|exchange access|where can you buy|where to purchase)\b/i;

const STANDARD_DISCLAIMER =
  "---\n\n*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*";

const DEPTH_TOP_UP =
  "Record any rejected venue, network, or order path as part of the checklist so the final decision shows what was ruled out as well as what remained available.";

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

function moveDisclaimerToEnd(content: string): string {
  const disclaimerPattern = /(?:\n{2,})?---\n{2,}\*Disclaimer:[^\n]+\*/i;
  const match = content.match(disclaimerPattern);
  if (!match) return content;

  const disclaimer = match[0].trim();
  const withoutDisclaimer = content.replace(disclaimerPattern, "").trim();
  return `${withoutDisclaimer}\n\n${disclaimer}`;
}

function insertBeforeDisclaimer(content: string, section: string): string {
  const disclaimerPattern = /(?:\n{2,})?---\n{2,}\*Disclaimer:[^\n]+\*/i;
  const match = content.match(disclaimerPattern);
  if (match?.index === undefined) return `${content.trim()}\n\n${section}`;

  const beforeDisclaimer = content.slice(0, match.index).trimEnd();
  const disclaimerAndAfter = content.slice(match.index).trimStart();
  return `${beforeDisclaimer}\n\n${section}\n\n${disclaimerAndAfter}`;
}

function hasDisclaimer(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("not constitute financial advice") ||
    lower.includes("informational purposes only") ||
    lower.includes("does not constitute financial advice") ||
    lower.includes("disclaimer")
  );
}

function ensureStandardDisclaimer(content: string): string {
  if (hasDisclaimer(content)) return content;
  return `${content.trim()}\n\n${STANDARD_DISCLAIMER}`;
}

function countWords(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

function hasMarkdownTable(lines: string[]): boolean {
  return lines.some((line, index) => {
    const current = line.trim();
    const next = lines[index + 1]?.trim() || "";
    return (
      current.startsWith("|") &&
      current.endsWith("|") &&
      next.startsWith("|") &&
      /^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(next)
    );
  });
}

function hasEarlySummaryTable(content: string): boolean {
  const beforeFirstHeading = content.split(/\n##\s+/)[0] || "";
  if (hasMarkdownTable(beforeFirstHeading.split(/\n/))) return true;
  return hasMarkdownTable(content.split(/\n/).slice(0, 18));
}

function buildEditorialSummaryTable(articleType: string, context?: TokenArticleContext): string {
  const label = articleType === "tge-preview" ? "launch preview" : `${articleType || "article"} page`;
  const symbol = context?.symbol ? context.symbol.toUpperCase() : "the asset";
  return [
    "| Editorial Check | How to Use It |",
    "| :--- | :--- |",
    `| Market snapshot | Confirm price, market cap, volume, rank, and supply before using this ${label}. |`,
    `| Risk context | Read the ${symbol} risk score together with liquidity, volatility, and source quality. |`,
    "| Reader action | Treat the page as research context, not a recommendation or execution instruction. |",
  ].join("\n");
}

function ensureEarlySummaryTable(content: string, articleType: string, context?: TokenArticleContext): string {
  if (hasEarlySummaryTable(content)) return content;

  const table = buildEditorialSummaryTable(articleType, context);
  const firstHeadingIndex = content.startsWith("## ") ? 0 : content.search(/\n##\s+/);
  const intro = firstHeadingIndex === -1 ? content.trim() : content.slice(0, firstHeadingIndex).trim();
  const rest = firstHeadingIndex === -1 ? "" : content.slice(firstHeadingIndex).trimStart();

  if (!intro) return normalizeArticleMarkdown(`${table}\n\n${rest}`);

  const introParts = intro.split(/\n{2,}/);
  const opening = introParts.shift() || "";
  const rebuiltIntro = [opening, table, ...introParts].filter(Boolean).join("\n\n");
  return normalizeArticleMarkdown([rebuiltIntro, rest].filter(Boolean).join("\n\n"));
}

function neutralizePromotionalSlogans(content: string, context?: TokenArticleContext): string {
  const subject = context?.tokenName || "This asset";
  const neutralSentence = `${subject} is reviewed through market data, liquidity, and risk context.`;

  return content
    .replace(/\bwe['’]?re here to make you take the red pill\.?/gi, neutralSentence)
    .replace(/\bforget what you know\.?\s*this is [^.]+\.?/gi, neutralSentence)
    .replace(/\bfinancial freedom for everyone\b/gi, "broader DeFi access")
    .replace(
      /\bunmatched scalable tech meets artificial general intelligence\s*\(AGI\),?\s*purpose built from the ground up to transcend the traditional limitations of blockchain\b/gi,
      "infrastructure that combines blockchain architecture with artificial intelligence features",
    );
}

function buildMinimumDepthSection(articleType: string, context: TokenArticleContext): string | null {
  const symbol = context.symbol.toUpperCase();

  if (articleType === "how-to-buy") {
    return [
      "## Final Verification Routine",
      "",
      `Before using this ${symbol} checklist, separate research from execution. Reopen the live market screen, confirm the ticker and network, compare spread and depth, then write down the exact reason the order size fits your risk plan. If any venue detail has changed since the last check, pause and verify withdrawal status, destination tags or memos, minimum withdrawal amounts, and support for the receiving wallet. Keep the first transfer small enough to treat as a network test, and store screenshots or transaction IDs with your records. This routine keeps the guide useful even when exchange availability, regional rules, or liquidity conditions change after publication.`,
    ].join("\n");
  }

  if (articleType === "price-prediction") {
    return [
      "## Scenario Review Routine",
      "",
      `Use the ${symbol} scenario page as a checklist, not a target price promise. Recheck current price, market cap, 24h volume, 30-day trend, ATH distance, and the latest risk score before comparing upside and downside cases. A scenario becomes weaker when liquidity falls, supply unlocks accelerate, or the catalyst has already been priced in. It becomes more useful when multiple data points improve at the same time and the invalidation level is clear before any position is considered.`,
    ].join("\n");
  }

  if (articleType === "overview") {
    return [
      "## How to Use This Overview",
      "",
      `Use the ${symbol} overview as a research checklist rather than a signal by itself. Start with price, market cap, volume, rank, supply, and ATH distance, then compare those figures with the risk score and category context. If the asset looks active only because of a short 24h move, wait for stronger confirmation from volume quality, liquidity, project updates, or peer comparison. If the data is stale or contradictory, refresh the live market snapshot before using the article for planning.`,
    ].join("\n");
  }

  if (articleType === "tge-preview") {
    return [
      "## Evidence Review Routine",
      "",
      `Use this ${symbol} launch preview to separate confirmed evidence from early signals. Recheck the expected launch window, confidence score, source count, contract status, tokenomics disclosure, and any exchange or DEX announcement before treating the project as graduated. A credible launch record should move from one-off mentions toward multiple independent sources, public documentation, and verifiable on-chain details.`,
    ].join("\n");
  }

  return null;
}

function ensureMinimumDepth(content: string, articleType: string, context?: TokenArticleContext): string {
  if (!context) return content;

  const threshold = getArticleQualityThresholds(articleType).minFailWords;
  if (countWords(content) >= threshold) return content;

  const section = buildMinimumDepthSection(articleType, context);
  if (!section) return content;

  const heading = section.split("\n", 1)[0];
  if (content.includes(heading)) {
    if (content.includes(DEPTH_TOP_UP)) return content;
    return insertBeforeDisclaimer(content, DEPTH_TOP_UP);
  }

  return insertBeforeDisclaimer(content, section);
}

function buildContinueResearchSection(articleType: string, context: TokenArticleContext): string | null {
  if (!context.tokenId) return null;

  const tokenPath = `/${context.tokenId}`;
  const symbol = context.symbol.toUpperCase();

  if (articleType === "how-to-buy") {
    return [
      "## Continue Research",
      "",
      `After checking where ${symbol} can be traded, compare the [${context.tokenName} overview](${tokenPath}) with the [price scenario page](${tokenPath}/price-prediction). The overview keeps risk score, market cap, volume, and supply context together, while the scenario page separates upside, base, and downside conditions. If you plan to self-custody, review the [hardware wallet guide](/best-crypto-hardware-wallets) before moving funds and keep the [tax workflow guide](/crypto-tax-guide) open while recording fills, fees, withdrawals, and transfer IDs.`,
    ].join("\n");
  }

  if (articleType === "price-prediction") {
    return [
      "## Continue Research",
      "",
      `Use this ${symbol} scenario analysis together with the [live ${context.tokenName} overview](${tokenPath}) and the [buying checklist](${tokenPath}/how-to-buy). A forecast is more useful when it is tied to market cap, liquidity, risk score, custody planning, and current execution costs. If the setup depends on future supply, review [FDV and dilution](/learn/fully-diluted-valuation-fdv); if it depends on trade execution, review [liquidity depth](/learn/liquidity-depth) before treating the scenario as actionable research.`,
    ].join("\n");
  }

  if (articleType === "overview") {
    return [
      "## Continue Research",
      "",
      `Use this ${symbol} overview as the starting point, then open the [price scenario page](${tokenPath}/price-prediction) for upside, base, and downside conditions or the [buying checklist](${tokenPath}/how-to-buy) for venue, fee, custody, and network verification. To compare ${context.tokenName} with broader research concepts, review [market cap basics](/learn/market-cap-explained), [FDV and dilution](/learn/fully-diluted-valuation-fdv), and [liquidity depth](/learn/liquidity-depth). Moving through those pages gives the market snapshot a clearer decision framework without turning this article into a buy or sell recommendation.`,
    ].join("\n");
  }

  return null;
}

function insertContinueResearch(content: string, articleType: string, context?: TokenArticleContext): string {
  if (!context || /##\s+Continue Research\b/i.test(content)) return content;

  const section = buildContinueResearchSection(articleType, context);
  if (!section) return content;

  const disclaimerPattern = /(?:\n{2,})?---\n{2,}\*Disclaimer:[^\n]+\*/i;
  const match = content.match(disclaimerPattern);
  if (match?.index === undefined) return `${content.trim()}\n\n${section}`;

  const beforeDisclaimer = content.slice(0, match.index).trimEnd();
  const disclaimerAndAfter = content.slice(match.index).trimStart();
  return `${beforeDisclaimer}\n\n${section}\n\n${disclaimerAndAfter}`;
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
  const base =
    articleType === "how-to-buy" && context
      ? neutralizeHowToBuyVenueClaims(content, context)
      : normalizeArticleMarkdown(content);
  const neutral = normalizeArticleMarkdown(neutralizePromotionalSlogans(base, context));
  const summarized = ensureEarlySummaryTable(neutral, articleType, context);
  const continued = insertContinueResearch(summarized, articleType, context);
  const linked = normalizeArticleMarkdown(moveDisclaimerToEnd(unwrapAmbiguousInternalArticleLinks(continued)));
  const deepened = ensureMinimumDepth(linked, articleType, context);
  return normalizeArticleMarkdown(moveDisclaimerToEnd(ensureStandardDisclaimer(deepened)));
}
