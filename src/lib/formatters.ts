/**
 * Pure utility formatters for currency and numbers.
 * Safe for use in both Server and Client Components.
 */

/** Format price for display. */
export function formatPrice(price: number | undefined | null): string {
  if (price === undefined || price === null || price < 0) return "$0.00";
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

/** Format percentage for display. Handles null/undefined safely. */
export function formatPercent(value: number | undefined | null, decimals: number = 2): string {
  if (value === undefined || value === null || isNaN(value)) return "0.00%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}


/** Format large numbers compactly. */
export function formatCompact(value: number | undefined | null): string {
  if (value === undefined || value === null) return "$0.00";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

/** Format supply numbers. */
export function formatSupply(value: number | undefined | null): string {
  if (value === undefined || value === null) return "0";
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}

/** Get a reliable PNG CDN URL for a token icon (Satori/OG compatible). */
/** Get a reliable PNG CDN URL for a token icon (Satori/OG compatible). */
export function getTokenIconUrl(symbol: string, id?: string): string {
  if (!symbol) return "";
  const s = symbol.toLowerCase();
  const slug = id?.toLowerCase();
  
  // 1. Mapping for Top & Breakout Tokens (Verified high-res PNGs)
  const mapping: Record<string, string> = {
    btc: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
    eth: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
    sol: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
    usdt: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
    usdc: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
    bnb: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png",
    xrp: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ripple/info/logo.png",
    ada: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cardano/info/logo.png",
    avax: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchex/info/logo.png",
    dot: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polkadot/info/logo.png",
    pepe: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6982508145454ce325ddBE47a25d4ec3d2311933/logo.png",
    // Breakout/Modern mappings
    aero: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x940181aA514413eD66E7F9De1cDAdE9E457C9571/logo.png",
    ath: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xbe0Ed4138121EcFC5c0E56B40517da27E6c5226B/logo.png",
    akt: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cosmos/assets/uakt/logo.png",
    adi: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x3E510363228Eb6F2D6d3B49E7f01267882269E5F/logo.png",
  };

  if (mapping[s]) return mapping[s];
  if (slug && mapping[slug]) return mapping[slug];

  // 2. Slug-based lookup (Comprehensive modern repo - covers 5000+ modern tokens)
  if (slug) {
    return `https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images/${slug}/large.png`;
  }

  // 3. Robust fallback to ticker-based PNG repo
  return `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${s}.png`;
}

/** Get a standardized risk tier classification. */
export function getRiskTier(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score < 4) return "LOW";
  if (score < 7) return "MEDIUM";
  return "HIGH";
}

/** Get a standardized hex color for a risk score (for OG / Canvas rendering). */
export function getRiskColor(score: number): string {
  if (score < 4) return "#10b981"; // green
  if (score < 7) return "#f59e0b"; // yellow
  return "#ef4444"; // red
}
