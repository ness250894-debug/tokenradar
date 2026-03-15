/**
 * Centralized exchange referral links for TokenRadar.
 * Used in UI components and social posting scripts.
 */
export const REFERRAL_LINKS = {
  Binance: "https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_65AUB&utm_source=default",
  Bybit: "https://www.bybit.com/invite?ref=QONQNG",
  OKX: "https://okx.com/join/66004268",
  KuCoin: "https://www.kucoin.com/r/rf/FQ67QZ7A",
} as const;

export type ExchangeName = keyof typeof REFERRAL_LINKS;

/**
 * Returns a formatted string of referral links for social media.
 * For Telegram (HTML), it returns clickable links.
 * For X (Twitter), it returns plain text links (considering character limits).
 */
export function getReferralText(type: "telegram" | "x", symbol: string): string {
  const sym = symbol.toUpperCase();
  if (type === "telegram") {
    return [
      `💰 <b>Trade ${sym} Now:</b>`,
      `• <a href="${REFERRAL_LINKS.Binance}">Binance</a>`,
      `• <a href="${REFERRAL_LINKS.Bybit}">Bybit</a>`,
      `• <a href="${REFERRAL_LINKS.OKX}">OKX</a>`,
      `• <a href="${REFERRAL_LINKS.KuCoin}">KuCoin</a>`,
    ].join("\n");
  } else {
    // For X, we pick the most popular one (Binance) to save space, or just point to others
    return `💰 Trade ${sym} on Binance: ${REFERRAL_LINKS.Binance}`;
  }
}
