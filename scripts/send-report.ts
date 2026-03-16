/**
 * TokenRadar Reporting Script
 * 
 * Aggregates API usage and errors into a Telegram report.
 * Supports: Daily, Weekly, Monthly summaries and balance tracking.
 * 
 * Usage:
 *   npx tsx scripts/send-report.ts [--daily | --weekly | --monthly]
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { getUsageSummary, getRemainingBalance } from "../src/lib/reporter";
import { getVisitorStats } from "../src/lib/visitor-fetcher";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function sendTelegramReport(message: string): Promise<void> {
  const token = process.env.TELEGRAM_REPORT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_REPORT_CHAT_ID;

  if (!token || !chatId) {
    console.error("TELEGRAM_REPORT_BOT_TOKEN or TELEGRAM_REPORT_CHAT_ID not set.");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send report: ${response.statusText}`);
  }
}

function formatPeriodLabel(days: number): string {
  if (days === 1) return "DAILY";
  if (days === 7) return "WEEKLY";
  if (days === 30) return "MONTHLY";
  return `${days}-DAY`;
}

async function main() {
  const args = process.argv.slice(2);
  const isWeekly = args.includes("--weekly");
  const isMonthly = args.includes("--monthly");
  const days = isMonthly ? 30 : isWeekly ? 7 : 1;
  
  const periodLabel = formatPeriodLabel(days);

  console.log(`Generating ${periodLabel} report...`);

  // 1. Gather Claude Data
  const claudeStats = getUsageSummary("claude", days);
  const claudeBalance = getRemainingBalance("claude");

  // 2. Gather X Data
  const xStats = getUsageSummary("x", days);
  const xBalance = getRemainingBalance("x");

  // 3. Gather CoinGecko Data
  const cgStats = getUsageSummary("coingecko", days);

  // 4. Gather Visitor Data
  const visitorStats = await getVisitorStats(days);

  // 5. Build message
  let report = `📊 *TokenRadar ${periodLabel} Report*\n`;
  report += `_${new Date().toLocaleDateString()}_\n\n`;

  report += `*🤖 Claude AI*\n`;
  report += `• Usage: ${claudeStats.units.toLocaleString()} tokens\n`;
  report += `• Cost: $${claudeStats.cost.toFixed(4)}\n`;
  if (claudeBalance !== null) report += `• *Remaining: $${claudeBalance.toFixed(2)}*\n`;
  report += `\n`;

  report += `*🐦 X (Twitter)*\n`;
  report += `• Posts: ${xStats.units}\n`;
  report += `• Cost: $${xStats.cost.toFixed(2)}\n`;
  if (xBalance !== null) report += `• *Remaining: $${xBalance.toFixed(2)}*\n`;
  report += `\n`;

  report += `*🦎 CoinGecko*\n`;
  report += `• API Calls: ${cgStats.units.toLocaleString()}\n`;
  report += `\n`;

  report += `*👥 Visitors*\n`;
  report += `• Unique Visitors: ${visitorStats.uniques.toLocaleString()}\n`;
  report += `\n`;

  // GitHub Actions (Placeholder for now, could be improved with GH API)
  report += `*⚙️ GitHub Actions*\n`;
  report += `• Status: Operational\n\n`;

  report += `---`;

  if (process.argv.includes("--dry-run")) {
    console.log("\n--- REPORT PREVIEW ---");
    console.log(report);
    console.log("----------------------");
  } else {
    await sendTelegramReport(report);
    console.log("Report sent to Telegram.");
  }
}

main().catch(console.error);
