import { getExchangeReferralRecords } from "./partners";

/**
 * TokenRadar — Centralized Configuration
 *
 * Single source of truth for social handles, referral links, site URLs,
 * and other constants used across multiple scripts.
 */

/** Site URL, configurable via environment variable. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";

/** Public contact details. */
export const CONTACT_EMAIL = "contact@tokenradar.co";
export const CONTACT_FORM_ENDPOINT = process.env.NEXT_PUBLIC_CONTACT_FORM_ENDPOINT || "https://formspree.io/f/mnjgzrjr";

/** Social media handles. */
export const SOCIAL = {
  xUrl: "https://x.com/tokenradarco",
  telegramUrl: "https://t.me/TokenRadarCo",
  threadsUrl: "https://www.threads.com/@tokenradarco",
  instagramUrl: "https://www.instagram.com/tokenradarco/",
  tiktokUrl: "https://www.tiktok.com/@tokenradarco",
  linkTreeUrl: "https://linktr.ee/tokenradarco",
  ecosystemUrl: SITE_URL,
} as const;

/** Exchange referral data. */
export const REFERRALS = getExchangeReferralRecords();

export const REFERRAL_URLS = Object.fromEntries(
  REFERRALS.map((referral) => [referral.name.toLowerCase(), referral.url]),
) as Record<string, string>;

/** Exchange referral links (HTML-formatted for Telegram). */
export const REFERRAL_LINKS_HTML = [
  "💳 <b>Paid exchange links:</b>",
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

/** Social footer lines used in Telegram posts. */
export const TELEGRAM_ECOSYSTEM_LINK_HTML =
  `<a href="${SOCIAL.linkTreeUrl}">TokenRadar Signal Desk</a>`;

export const TELEGRAM_SIGNAL_NOTE =
  "Research signal, not financial advice. Confirm liquidity, risk, and invalidation.";

export const SOCIAL_FOOTER = [
  TELEGRAM_ECOSYSTEM_LINK_HTML,
  TELEGRAM_SIGNAL_NOTE,
];

/**
 * Generate the standard Telegram footer with connected TokenRadar links.
 */
export function getTelegramFooter(symbol: string): string {
  return `
${TELEGRAM_ECOSYSTEM_LINK_HTML}

${TELEGRAM_SIGNAL_NOTE}
#${symbol.toUpperCase()} #Crypto
`;
}

/** Social Platform Constraints. */
export const SOCIAL_PLATFORM_LIMITS = {
  TELEGRAM: {
    TEXT_LIMIT: 4096,
    CAPTION_LIMIT: 1024,
    AI_SUMMARY_CHARS: 620,
    PHOTO_AI_SUMMARY_CHARS: 620,
    VIDEO_AI_SUMMARY_CHARS: 560,
    MOVERS_AI_SUMMARY_CHARS: 520,
  },
  X: {
    CHAR_LIMIT: 280,
  },
  INSTAGRAM: {
    CAPTION_LIMIT: 2200,
    HASHTAG_LIMIT: 30,
    DAILY_POST_LIMIT: 100,
  },
  THREADS: {
    TEXT_LIMIT: 500,
    TOPIC_TAG_MAX_LENGTH: 50,
    DAILY_POST_LIMIT: 250,
    MAX_SPOILER_ENTITIES: 10,
  },
  TIKTOK: {
    CAPTION_LIMIT: 2200,
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

/**
 * Minimum days before a daily video breakout token can be used again.
 */
export const VIDEO_COOLDOWN_DAYS = 7;

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
