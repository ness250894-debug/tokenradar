/**
 * TokenRadar — Centralized Configuration
 *
 * Single source of truth for social handles, referral links, site URLs,
 * and other constants used across multiple scripts.
 */

/** Site URL, configurable via environment variable. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";

/** Social media handles. */
export const SOCIAL = {
  xUrl: "https://x.com/tokenradarco",
  telegramUrl: "https://t.me/TokenRadarCo",
} as const;

/** Exchange referral data. */
export const REFERRALS = [
  { name: "Binance", url: "https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_65AUB&utm_source=default" },
  { name: "ByBit", url: "https://www.bybit.com/invite?ref=QONQNG" },
  { name: "OKX", url: "https://okx.com/join/66004268" },
  { name: "KuCoin", url: "https://www.kucoin.com/r/rf/FQ67QZ7A" },
] as const;

export const REFERRAL_URLS = Object.fromEntries(
  REFERRALS.map((referral) => [referral.name.toLowerCase(), referral.url]),
) as Record<string, string>;

/** Exchange referral links (HTML-formatted for Telegram). */
export const REFERRAL_LINKS_HTML = [
  "💳 <b>Trade on top exchanges:</b>",
  REFERRALS.map((r) => `<a href="${r.url}">${r.name}</a>`).join(" | "),
];

/** Social footer icons (Technical Brutalist style). */
export const ICONS = {
  ECOSYSTEM: "🌐",
  DASHBOARD: "📊",
  X: "𝕏",
  TELEGRAM: "✈️",
  TRADE: "💳",
} as const;

/** Social footer lines used in posts. */
export const SOCIAL_FOOTER = [
  `${ICONS.DASHBOARD} tokenradar.co`,
  `${ICONS.X} X: ${SOCIAL.xUrl}`,
  `${ICONS.TELEGRAM} TG: ${SOCIAL.telegramUrl}`,
];

/**
 * Generate the standard Telegram footer with ecosystem links and referral links.
 */
export function getTelegramFooter(symbol: string): string {
  const siteUrl = SITE_URL;
  // Note: Spacing matches the screenshot provided by user
  return `
${ICONS.ECOSYSTEM} <b>The TokenRadar Ecosystem:</b>
${ICONS.DASHBOARD} <a href="${siteUrl}">TokenRadar Dashboard</a> | ${ICONS.X} <a href="${SOCIAL.xUrl}">X (Twitter)</a> | ${ICONS.TELEGRAM} <a href="${SOCIAL.telegramUrl}">Telegram</a>

${REFERRAL_LINKS_HTML.join("\n")}

#${symbol.toUpperCase()} #Crypto
`;
}

/** Social Platform Constraints. */
export const SOCIAL_PLATFORM_LIMITS = {
  TELEGRAM: {
    TEXT_LIMIT: 4096,
    CAPTION_LIMIT: 1024,
    AI_SUMMARY_CHARS: 1200,
    PHOTO_AI_SUMMARY_CHARS: 750,
  },
  X: {
    CHAR_LIMIT: 280,
  },
} as const;

/** X API pay-per-use cost per post create (as of Feb 2026). */
export const X_COST_PER_POST = 0.01;

/**
 * CoinGecko IDs of stablecoins and pegged assets to exclude from market update posts.
 * Includes USD-pegged, EUR-pegged, gold-pegged, and yield-bearing stablecoins.
 *
 * Derived from actual tokens in data/tokens/ + CoinGecko stablecoin category.
 */
export const STABLECOIN_IDS = new Set([
  // ── USD-pegged stablecoins ──
  "tether",                // USDT
  "usd-coin",              // USDC
  "dai",                   // DAI
  "binance-usd",           // BUSD (deprecated but may linger)
  "true-usd",              // TUSD
  "paxos-standard",        // USDP
  "frax",                  // FRAX
  "usdd",                  // USDD
  "gemini-dollar",         // GUSD (gusd in data)
  "first-digital-usd",     // FDUSD
  "paypal-usd",            // PYUSD
  "ethena-usde",           // USDe
  "usual-usd",             // USD0
  "havven",                // sUSD (Synthetix)
  "usds",                  // USDS (Sky/MakerDAO)
  "crvusd",                // crvUSD (Curve)
  "gho",                   // GHO (Aave)
  "frax-usd",              // frxUSD
  "just",                  // USDJ (JUST)
  "usx",                   // USX (dForce)
  "nusd-2",                // NUSD
  "usd1-wlfi",             // USD1 (World Liberty Financial)
  "ripple-usd",            // RLUSD
  "global-dollar",         // USDG
  "stable-2",              // USD- (generic stable)
  "cap-usd",               // cUSD
  "agora-dollar",          // AUSD
  "usdtb",                 // USDtb (Ethena)
  "usdai",                 // USDAI
  "usda-2",                // USDA
  "pleasing-usd",          // PLUSD
  "infinifi-usd",          // iUSD
  "re-protocol-reusd",     // reUSD
  "satoshi-stablecoin",    // SAT
  "astherus-usdf",         // USDF
  "avant-usd",             // avUSD
  "bfusd",                 // BFUSD (Binance)

  // ── EUR-pegged stablecoins ──
  "euro-coin",             // EURC (Circle)
  "stasis-eurs",           // EURS (Stasis)

  // ── Gold-pegged ──
  "tether-gold",           // XAUT
  "pax-gold",              // PAXG
  "kinesis-gold",          // KAU

  // ── Yield-bearing / Tokenized treasuries ──
  // (pegged to ~$1, price doesn't move meaningfully)
  "ondo-us-dollar-yield",  // USDY
  "ousg",                  // OUSG
  "hashnote-usyc",         // USYC
  "eutbl",                 // EUTBL
  "ylds",                  // YLDS
  "blackrock-usd-institutional-digital-liquidity-fund", // BUIDL
  "superstate-short-duration-us-government-securities-fund-ustb", // USTB
  "fidelity-digital-interest-token", // FDIT
  "spiko-us-t-bills-money-market-fund", // USTBL
  "janus-henderson-anemoy-treasury-fund", // JHT
  "janus-henderson-anemoy-aaa-clo-fund",  // CLO
  "apollo-diversified-credit-securitize-fund", // ACRED
  "theo-short-duration-us-treasury-fund", // THEO
  "figure-heloc",          // HELOC
  "tradable-na-rent-financing-platform-sstn", // SSTN
  "tradable-singapore-fintech-ssl-2",  // SSL
  "precious-metals-usd",   // PMUSD
]);

// ── Post Deduplication Cooldowns ───────────────────────────────

/**
 * Minimum days before a trending token (CoinGecko/X) can be posted again.
 * Set to 0 for same-day-only dedup (old behavior).
 */
export const TRENDING_COOLDOWN_DAYS = 3;

/**
 * Minimum days before a non-trending token (gainer/safe/spotlight) can be
 * posted again. Applies to priorities 3-5.
 */
export const GENERAL_COOLDOWN_DAYS = 30;

// ── Interactive Poll Config ────────────────────────────────────

/** Default poll duration in minutes (24 hours). */
export const POLL_DURATION_MINUTES = 1440;

/** Narrative categories rotated in the "Narrative Poll" type. */
export const INTERACTIVE_POST_NARRATIVES = [
  "AI Tokens",
  "Layer 2s",
  "RWA",
  "DeFi",
] as const;

/** Emoji prefixes for text-based fallback polls (when native poll fails). */
export const POLL_FALLBACK_EMOJIS = ["1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3"] as const;
