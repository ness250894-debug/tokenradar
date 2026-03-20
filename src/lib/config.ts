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
