import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

import { formatCompact, formatPercent, formatPrice, getRiskColor } from "./formatters";
import { fetchTokenIconDataUrl } from "./token-icon-data";

export interface TokenComparisonMetrics {
  riskScore: number;
  growthPotentialIndex: number;
  narrativeStrength?: number;
  volatilityIndex?: number;
}

export interface TokenComparisonToken {
  id: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  categories?: string[];
  price: number;
  change24h: number;
  change7d?: number | null;
  marketCap: number;
  volume24h: number;
  rank: number;
  metrics: TokenComparisonMetrics;
}

export interface TokenComparisonPair {
  left: TokenComparisonToken;
  right: TokenComparisonToken;
  context: string;
}

type RenderableComparisonToken = TokenComparisonToken & { iconDataUrl?: string };

const MAX_ABS_CHANGE_24H = 100;
const MAX_MARKET_CAP_RATIO = 5;
const IGNORED_COMPARISON_CATEGORY_PARTS = [
  "ecosystem",
  "portfolio",
  "stablecoin",
  "native",
  "made in",
  "alleged",
  "tokenized",
];

let robotoFontBuffer: ArrayBuffer | null = null;

async function getFont(): Promise<ArrayBuffer> {
  if (!robotoFontBuffer) {
    const response = await fetch(
      "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Medium.ttf",
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch Roboto font: HTTP ${response.status}`);
    }
    robotoFontBuffer = await response.arrayBuffer();
  }
  return robotoFontBuffer;
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isEligibleToken(token: TokenComparisonToken): boolean {
  return Boolean(
    token.id &&
    token.symbol &&
    token.name &&
    /^[\x20-\x7E]+$/.test(token.symbol) &&
    /^[\x20-\x7E]+$/.test(token.name) &&
    Number.isFinite(token.price) &&
    token.price > 0 &&
    Number.isFinite(token.marketCap) &&
    token.marketCap > 0 &&
    Number.isFinite(token.volume24h) &&
    token.volume24h > 0 &&
    (token.volume24h >= 50_000 || token.volume24h / token.marketCap >= 0.001) &&
    Number.isFinite(token.change24h) &&
    Math.abs(token.change24h) <= MAX_ABS_CHANGE_24H &&
    Number.isFinite(token.change7d) &&
    Number.isFinite(token.metrics.riskScore) &&
    Number.isFinite(token.metrics.growthPotentialIndex)
  );
}

function isUsefulComparisonCategory(category: string): boolean {
  const normalized = category.trim().toLowerCase();
  return Boolean(
    normalized &&
    !IGNORED_COMPARISON_CATEGORY_PARTS.some((part) => normalized.includes(part))
  );
}

export function findSharedComparisonCategory(
  left: TokenComparisonToken,
  right: TokenComparisonToken,
): string | null {
  const rightCategories = new Set((right.categories || []).map((category) => category.toLowerCase()));
  return (left.categories || []).find(
    (category) => isUsefulComparisonCategory(category) && rightCategories.has(category.toLowerCase()),
  ) || null;
}

function marketCapRatio(left: TokenComparisonToken, right: TokenComparisonToken): number {
  return Math.max(left.marketCap, right.marketCap) / Math.min(left.marketCap, right.marketCap);
}

function pairScore(left: TokenComparisonToken, right: TokenComparisonToken, dateKey: string): number {
  const capRatio = marketCapRatio(left, right);
  const sharedCategory = findSharedComparisonCategory(left, right);
  const changeContrast = Math.min(Math.abs(left.change24h - right.change24h), 40);
  const sevenDayContrast = Math.min(
    Math.abs((left.change7d || 0) - (right.change7d || 0)),
    50,
  );
  const riskContrast = Math.abs(left.metrics.riskScore - right.metrics.riskScore);
  const growthContrast = Math.abs(
    left.metrics.growthPotentialIndex - right.metrics.growthPotentialIndex,
  );
  const capCloseness = Math.max(0, 30 - Math.log2(capRatio) * 12);
  const deterministicJitter = stableHash(`${dateKey}:${left.id}:${right.id}`) % 17;

  return (
    (sharedCategory ? 45 : 0) +
    changeContrast * 3 +
    sevenDayContrast +
    riskContrast * 4 +
    growthContrast * 0.4 +
    capCloseness +
    deterministicJitter / 10
  );
}

export function selectTokenComparisonPair(
  tokens: TokenComparisonToken[],
  options: { recentlyPosted?: Iterable<string>; dateKey?: string } = {},
): TokenComparisonPair {
  const recentlyPosted = new Set(options.recentlyPosted || []);
  const dateKey = options.dateKey || new Date().toISOString().slice(0, 10);
  const eligible = tokens.filter(isEligibleToken);
  const fresh = eligible.filter((token) => !recentlyPosted.has(token.id));
  const pool = fresh.length >= 2 ? fresh : eligible;

  if (pool.length < 2) {
    throw new Error(`Need at least two eligible tokens for comparison; found ${pool.length}.`);
  }

  let bestPair: [TokenComparisonToken, TokenComparisonToken] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const hasCategorizedComparablePair = pool.some((left, leftIndex) =>
    pool.slice(leftIndex + 1).some((right) =>
      marketCapRatio(left, right) <= MAX_MARKET_CAP_RATIO &&
      Boolean(findSharedComparisonCategory(left, right))
    )
  );

  for (let leftIndex = 0; leftIndex < pool.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < pool.length; rightIndex += 1) {
      const left = pool[leftIndex];
      const right = pool[rightIndex];
      if (marketCapRatio(left, right) > MAX_MARKET_CAP_RATIO) continue;
      if (hasCategorizedComparablePair && !findSharedComparisonCategory(left, right)) continue;

      const score = pairScore(left, right, dateKey);
      if (score > bestScore) {
        bestScore = score;
        bestPair = [left, right];
      }
    }
  }

  if (!bestPair) {
    const ranked = [...pool].sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id));
    bestPair = [ranked[0], ranked[1]];
  }

  const [left, right] = bestPair;
  return {
    left,
    right,
    context: findSharedComparisonCategory(left, right) || "Market matchup",
  };
}

export function volumeToMarketCap(token: TokenComparisonToken): number {
  return token.marketCap > 0 ? token.volume24h / token.marketCap : 0;
}

function compactRatio(value: number): string {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function comparisonPercent(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? formatPercent(value) : "N/A";
}

export function buildComparisonCaptions(pair: TokenComparisonPair): {
  telegram: string;
  x: string;
  instagram: string;
  threads: string;
} {
  const { left, right, context } = pair;
  const leftSymbol = left.symbol.toUpperCase();
  const rightSymbol = right.symbol.toUpperCase();
  const headline = `${leftSymbol} vs ${rightSymbol}`;
  const compactMetrics = [
    `24h: ${formatPercent(left.change24h)} vs ${formatPercent(right.change24h)}`,
    `7d: ${comparisonPercent(left.change7d)} vs ${comparisonPercent(right.change7d)}`,
    `Market cap: ${formatCompact(left.marketCap)} vs ${formatCompact(right.marketCap)}`,
    `Volume/cap: ${compactRatio(volumeToMarketCap(left))} vs ${compactRatio(volumeToMarketCap(right))}`,
    `Risk: ${left.metrics.riskScore}/10 vs ${right.metrics.riskScore}/10`,
    `Growth: ${left.metrics.growthPotentialIndex}/100 vs ${right.metrics.growthPotentialIndex}/100`,
  ];

  const telegram = [
    `<b>${headline} - Token Comparison</b>`,
    `<i>${context}</i>`,
    compactMetrics.join("\n"),
    "<b>Radar read:</b> the stronger candle is not automatically the stronger setup. Compare participation, risk, and follow-through together.",
  ].join("\n\n");

  const x = [
    `$${leftSymbol} vs $${rightSymbol} - TokenRadar comparison`,
    compactMetrics.slice(0, 4).join("\n"),
    `Risk: ${left.metrics.riskScore} vs ${right.metrics.riskScore} | Growth: ${left.metrics.growthPotentialIndex} vs ${right.metrics.growthPotentialIndex}`,
    "Compare the setup, not just the candle. tokenradar.co",
  ].join("\n");

  const instagram = [
    `${left.name} ($${leftSymbol}) vs ${right.name} ($${rightSymbol})`,
    `${context} - a side-by-side market snapshot.`,
    compactMetrics.join("\n"),
    "No single metric decides the matchup. Momentum needs participation; recovery room still has to be weighed against risk and liquidity.",
    "Data snapshot only. Not financial advice.",
    "TokenRadar.co",
    `#Crypto #TokenComparison #TokenRadar #${leftSymbol.replace(/[^A-Z0-9_]/g, "")} #${rightSymbol.replace(/[^A-Z0-9_]/g, "")} #CryptoResearch`,
  ].join("\n\n");

  const threads = [
    `${headline} - ${context}`,
    compactMetrics.join("\n"),
    "Which setup is better supported by participation and risk - not just price momentum? Data snapshot, not financial advice.",
  ].join("\n\n");

  return { telegram, x, instagram, threads };
}

function tokenBadge(symbol: string) {
  const label = symbol.toUpperCase().slice(0, 6);
  return (
    <div
      style={{
        width: 92,
        height: 92,
        borderRadius: 24,
        background: "linear-gradient(135deg, #CCFF00 0%, #00C2FF 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#07080B",
        fontSize: label.length > 4 ? 22 : 30,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
}

function tokenIcon(token: RenderableComparisonToken) {
  if (!token.iconDataUrl) return tokenBadge(token.symbol);

  return (
    <div
      style={{
        width: 92,
        height: 92,
        borderRadius: 24,
        background: "#17191F",
        border: "1px solid rgba(255,255,255,0.10)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders a static social image. */}
      <img
        src={token.iconDataUrl}
        alt={token.name}
        width={76}
        height={76}
        style={{ objectFit: "contain", borderRadius: 38 }}
      />
    </div>
  );
}

function tokenHeader(token: RenderableComparisonToken, accent: string) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, width: "100%" }}>
      {tokenIcon(token)}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ color: accent, fontSize: 22, fontWeight: 700, letterSpacing: "0.08em" }}>
          ${token.symbol.toUpperCase()}
        </span>
        <span style={{ color: "#F5F7FA", fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
          {token.name.length > 22 ? `${token.name.slice(0, 21)}...` : token.name}
        </span>
        <span style={{ color: "#7E8491", fontSize: 19, marginTop: 6 }}>Market rank #{token.rank}</span>
      </div>
    </div>
  );
}

function metricCell(label: string, value: string, valueColor = "#F5F7FA") {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "18px 20px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <span style={{ color: "#727784", fontSize: 16, letterSpacing: "0.08em", marginBottom: 6 }}>
        {label}
      </span>
      <span style={{ color: valueColor, fontSize: 28, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function tokenColumn(token: RenderableComparisonToken, accent: string) {
  const changeColor = token.change24h >= 0 ? "#00FFA3" : "#FF5470";
  return (
    <div
      style={{
        width: 458,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: 28,
        borderRadius: 28,
        background: "rgba(17,19,25,0.94)",
        border: `1px solid ${accent}44`,
      }}
    >
      {tokenHeader(token, accent)}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        {metricCell("PRICE", formatPrice(token.price))}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ width: "50%", display: "flex" }}>{metricCell("24H", formatPercent(token.change24h), changeColor)}</div>
          <div style={{ width: "50%", display: "flex" }}>{metricCell("7D", comparisonPercent(token.change7d), (token.change7d || 0) >= 0 ? "#00FFA3" : "#FF5470")}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ width: "50%", display: "flex" }}>{metricCell("MARKET CAP", formatCompact(token.marketCap))}</div>
          <div style={{ width: "50%", display: "flex" }}>{metricCell("VOL / CAP", compactRatio(volumeToMarketCap(token)))}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ width: "50%", display: "flex" }}>{metricCell("RISK", `${token.metrics.riskScore}/10`, getRiskColor(token.metrics.riskScore))}</div>
          <div style={{ width: "50%", display: "flex" }}>{metricCell("GROWTH", `${token.metrics.growthPotentialIndex}/100`, accent)}</div>
        </div>
      </div>
    </div>
  );
}

export async function generateTokenComparisonImage(pair: TokenComparisonPair): Promise<Buffer> {
  const fontData = await getFont();
  const [left, right] = await Promise.all(
    [pair.left, pair.right].map(async (token) => ({
      ...token,
      iconDataUrl: await fetchTokenIconDataUrl(token),
    })),
  ) as [RenderableComparisonToken, RenderableComparisonToken];

  const element = (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "54px 56px 42px",
        background: "#07080B",
        color: "#F5F7FA",
        fontFamily: "Roboto",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", width: 720, height: 720, borderRadius: 360, top: -420, left: -240, background: "rgba(204,255,0,0.08)" }} />
      <div style={{ position: "absolute", width: 760, height: 760, borderRadius: 380, bottom: -520, right: -260, background: "rgba(0,194,255,0.09)" }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%", zIndex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ color: "#CCFF00", fontSize: 21, fontWeight: 700, letterSpacing: "0.15em" }}>TOKEN COMPARISON</span>
          <span style={{ color: "#F5F7FA", fontSize: 46, fontWeight: 700, marginTop: 8 }}>Side-by-Side Market Read</span>
          <span style={{ color: "#7E8491", fontSize: 20, marginTop: 8 }}>{pair.context} | Market data + TokenRadar metrics</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#CCFF00" }} />
          <span style={{ fontSize: 27, fontWeight: 700 }}>TOKEN<span style={{ color: "#CCFF00" }}>RADAR</span></span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 38, zIndex: 1 }}>
        {tokenColumn(left, "#CCFF00")}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: 36, background: "#17191F", border: "1px solid rgba(255,255,255,0.12)", color: "#F5F7FA", fontSize: 25, fontWeight: 700 }}>VS</div>
        {tokenColumn(right, "#00C2FF")}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 28, zIndex: 1 }}>
        <span style={{ color: "#8B919D", fontSize: 18 }}>Compare momentum, participation, valuation, and risk together.</span>
        <span style={{ color: "#CCFF00", fontSize: 18, fontWeight: 700 }}>TOKENRADAR.CO</span>
      </div>
    </div>
  );

  const svg = await satori(element, {
    width: 1080,
    height: 1080,
    fonts: [{ name: "Roboto", data: fontData, weight: 600, style: "normal" }],
  });
  const resvg = new Resvg(svg, {
    background: "#07080B",
    fitTo: { mode: "width", value: 1080 },
  });
  return Buffer.from(resvg.render().asPng());
}
