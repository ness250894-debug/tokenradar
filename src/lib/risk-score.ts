/** The four deterministic inputs to TokenRadar's observed market risk score. */
export function riskScoreFactors(volatility: number, marketCap: number, volume24h: number, athChangePercentage: number) {
  const volumeRatio = marketCap > 0 ? (volume24h / marketCap) * 100 : 0;
  return {
    volatility: Math.min(2.5, (volatility / 20) * 2.5),
    marketCap: marketCap >= 10e9 ? 0 : marketCap <= 500e6 ? 2.5 : 2.5 * (1 - (marketCap - 500e6) / (10e9 - 500e6)),
    turnover: volumeRatio >= 10 ? 0 : volumeRatio <= 1 ? 2.5 : 2.5 * (1 - (volumeRatio - 1) / 9),
    drawdown: Math.min(2.5, (Math.abs(athChangePercentage) / 90) * 2.5),
  };
}

export function computeRiskScore(volatility: number, marketCap: number, volume24h: number, athChangePercentage: number): number {
  const factors = riskScoreFactors(volatility, marketCap, volume24h, athChangePercentage);
  return Math.max(1, Math.min(10, Math.round(Object.values(factors).reduce((sum, value) => sum + value, 0))));
}

/** Coefficient of variation of the cached price window, expressed as a percentage. */
export function computeVolatility(prices: { price: number }[]): number {
  if (prices.length < 2) return 0;
  const values = prices.map((point) => point.price);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return (Math.sqrt(variance) / mean) * 100;
}
