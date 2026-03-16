/**
 * TokenRadar Reporting Hub
 * 
 * Centralized utility for:
 * 1. Immediate error reporting to Telegram.
 * 2. API usage tracking (daily buckets) for cost analysis.
 * 3. Balance/Budget monitoring.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../../data");
const LOGS_DIR = path.join(DATA_DIR, "logs");
const METRICS_DIR = path.join(DATA_DIR, "metrics");
const USAGE_FILE = path.join(METRICS_DIR, "api-usage-history.json");
const ERRORS_FILE = path.join(LOGS_DIR, "errors.json");

// Ensure directories exist
[LOGS_DIR, METRICS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

export interface UsageRecord {
  date: string; // YYYY-MM-DD
  provider: string; // 'claude' | 'x' | 'coingecko'
  units: number; // tokens, posts, or calls
  cost: number; // in USD
}

export interface ApiUsageHistory {
  history: UsageRecord[];
  initialBalances: Record<string, number>;
}

/**
 * Sends a notification to Telegram.
 */
async function sendTelegramAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_REPORT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_REPORT_CHAT_ID;

  if (!token || !chatId) {
    console.warn("  [reporter] TELEGRAM_REPORT_BOT_TOKEN or TELEGRAM_REPORT_CHAT_ID not set.");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
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
      console.error(`  [reporter] Failed to send Telegram alert: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`  [reporter] Error sending Telegram alert: ${error}`);
  }
}

/**
 * Logs an error and sends an immediate alert to Telegram.
 */
export async function logError(source: string, error: any, isFatal = true): Promise<void> {
  const errorMsg = error instanceof Error ? error.stack || error.message : String(error);
  const timestamp = new Date().toISOString();

  // Save to file
  let errors = [];
  if (fs.existsSync(ERRORS_FILE)) {
    try {
      errors = JSON.parse(fs.readFileSync(ERRORS_FILE, "utf-8"));
    } catch (e) {
      errors = [];
    }
  }
  errors.push({ timestamp, source, message: errorMsg, isFatal });
  fs.writeFileSync(ERRORS_FILE, JSON.stringify(errors.slice(-100), null, 2));

  console.error(`  [reporter] ERROR in ${source}: ${errorMsg}`);

  // Immediate Telegram alert
  if (isFatal) {
    const alertText = `🚨 *FATAL ERROR: ${source}*\n\n\`\`\`\n${errorMsg.substring(0, 500)}\n\`\`\`\n\n_Time: ${timestamp}_`;
    await sendTelegramAlert(alertText);
  }
}

/**
 * Tracks API usage for cost and limit analysis.
 */
export function trackUsage(provider: string, units: number, cost: number): void {
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  
  let data: ApiUsageHistory = { history: [], initialBalances: {} };
  
  if (fs.existsSync(USAGE_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
    } catch (e) {
      data = { history: [], initialBalances: {} };
    }
  }

  // Use values from env if not set in file
  data.initialBalances.claude = data.initialBalances.claude || Number(process.env.INITIAL_CLAUDE_BALANCE || 0);
  data.initialBalances.x = data.initialBalances.x || Number(process.env.INITIAL_X_BALANCE || 0);

  data.history.push({ date, provider, units, cost });
  
  // Keep only last 365 days of history to avoid file bloating
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
  const cutoffStr = cutoff.toISOString().split("T")[0];
  
  data.history = data.history.filter(h => h.date >= cutoffStr);

  fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
  console.log(`  [reporter] Tracked ${provider} usage: ${units} units, $${cost.toFixed(4)}`);
}

/**
 * Gets usage stats for a specific period.
 */
export function getUsageSummary(provider: string, days: number): { units: number; cost: number } {
  if (!fs.existsSync(USAGE_FILE)) return { units: 0, cost: 0 };
  
  const data: ApiUsageHistory = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  return data.history
    .filter(h => h.provider === provider && h.date >= cutoffStr)
    .reduce(
      (acc, h) => ({ units: acc.units + h.units, cost: acc.cost + h.cost }),
      { units: 0, cost: 0 }
    );
}

/**
 * Calculates remaining balance for a provider.
 * Returns null if no initial balance is set.
 */
export function getRemainingBalance(provider: string): number | null {
  if (!fs.existsSync(USAGE_FILE)) return null;
  
  const data: ApiUsageHistory = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
  const initial = data.initialBalances[provider];
  
  if (initial === undefined || initial === 0) return null;
  
  const totalCost = data.history
    .filter(h => h.provider === provider)
    .reduce((sum, h) => sum + h.cost, 0);

  return initial - totalCost;
}
