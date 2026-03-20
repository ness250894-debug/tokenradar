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

/** Exchange referral links (HTML-formatted for Telegram). */
export const REFERRAL_LINKS_HTML = [
  "💳 <b>Trade on top exchanges:</b>",
  '<a href="https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_65AUB&utm_source=default">Binance</a> | ' +
  '<a href="https://www.bybit.com/invite?ref=QONQNG">ByBit</a> | ' +
  '<a href="https://okx.com/join/66004268">OKX</a> | ' +
  '<a href="https://www.kucoin.com/r/rf/FQ67QZ7A">KuCoin</a>',
];

/** Social footer lines used in posts. */
export const SOCIAL_FOOTER = [
  `🔗 tokenradar.co`,
  `🐦 X: ${SOCIAL.xUrl}`,
  `👥 TG: ${SOCIAL.telegramUrl}`,
];

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
