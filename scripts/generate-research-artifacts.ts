/**
 * Generates aggregate TokenRadar research exports from local market and metric data.
 * No network requests or generative-AI services are used.
 */
import * as fs from "fs";
import * as path from "path";

import { getAllTokens, getTokenMetrics } from "../src/lib/content-loader";
import { buildMarketRiskSnapshot } from "../src/lib/research-snapshot";
import { writeFileAtomicSync } from "../src/lib/utils";

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main(): Promise<void> {
  const tokens = await getAllTokens();
  const metricRows = await Promise.all(tokens.map(async (token) => [token.id, await getTokenMetrics(token.id)] as const));
  const metricsByTokenId = new Map(metricRows.flatMap(([tokenId, metrics]) => metrics ? [[tokenId, metrics] as const] : []));
  const snapshot = buildMarketRiskSnapshot(tokens, metricsByTokenId);
  const outputDir = path.resolve(process.cwd(), "public/data");
  fs.mkdirSync(outputDir, { recursive: true });

  const categoryCsv = [
    ["category", "token_count", "average_risk_1_to_10", "average_volatility_0_to_100", "average_change_24h_percent", "total_market_cap_usd"],
    ...snapshot.categories.map((row) => [
      row.category,
      row.tokenCount,
      row.averageRisk,
      row.averageVolatility,
      row.averageChange24h,
      row.totalMarketCap,
    ]),
  ].map((row) => row.map(csvCell).join(",")).join("\n");

  writeFileAtomicSync(path.join(outputDir, "tokenradar-category-risk-snapshot.csv"), `${categoryCsv}\n`);
  writeFileAtomicSync(
    path.join(outputDir, "tokenradar-market-risk-snapshot.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );

  console.log(JSON.stringify({
    generatedAt: snapshot.generatedAt,
    sampleSize: snapshot.sampleSize,
    categoryRows: snapshot.categories.length,
    files: [
      "public/data/tokenradar-category-risk-snapshot.csv",
      "public/data/tokenradar-market-risk-snapshot.json",
    ],
    aiCalls: 0,
    networkRequests: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
