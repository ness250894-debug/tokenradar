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
const ERRORS_DIR = path.join(LOGS_DIR, "errors");
const METRICS_DIR = path.join(DATA_DIR, "metrics");
const USAGE_DIR = path.join(METRICS_DIR, "usage");

const LEGACY_USAGE_FILE = path.join(METRICS_DIR, "api-usage-history.json");
const LEGACY_ERRORS_FILE = path.join(LOGS_DIR, "errors.json");

// Ensure directories exist
[LOGS_DIR, ERRORS_DIR, METRICS_DIR, USAGE_DIR].forEach(dir => {
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
  const id = Math.random().toString(36).substring(2, 8);

  const errorRecord = { timestamp, source, message: errorMsg, isFatal };
  
  // Save to decentralized file
  const errorFile = path.join(ERRORS_DIR, `${timestamp.replace(/[:.]/g, "-")}-${id}.json`);
  fs.writeFileSync(errorFile, JSON.stringify(errorRecord, null, 2));

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
  const timestamp = Date.now();
  const id = Math.random().toString(36).substring(2, 8);
  
  const record: UsageRecord = { date, provider, units, cost };
  
  const usageFile = path.join(USAGE_DIR, `${date}-${timestamp}-${id}.json`);
  fs.writeFileSync(usageFile, JSON.stringify(record, null, 2));
  
  console.log(`  [reporter] Tracked ${provider} usage: ${units} units, $${cost.toFixed(4)}`);
}

/**
 * Loads all usage records, combining legacy file and new decentralized folder.
 */
function loadAllHistory(): UsageRecord[] {
  let history: UsageRecord[] = [];

  // 1. Load legacy data if it exists
  if (fs.existsSync(LEGACY_USAGE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(LEGACY_USAGE_FILE, "utf-8"));
      if (Array.isArray(data.history)) {
        history = history.concat(data.history);
      }
    } catch (e) {
      console.warn("  [reporter] Failed to parse legacy usage file.");
    }
  }

  // 2. Load decentralized data
  if (fs.existsSync(USAGE_DIR)) {
    const files = fs.readdirSync(USAGE_DIR).filter(f => f.endsWith(".json"));
    for (const f of files) {
      try {
        const record = JSON.parse(fs.readFileSync(path.join(USAGE_DIR, f), "utf-8"));
        history.push(record);
      } catch (e) { /* skip corrupt files */ }
    }
  }

  return history;
}

/**
 * Gets usage stats for a specific period.
 */
export function getUsageSummary(provider: string, days: number): { units: number; cost: number } {
  const history = loadAllHistory();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  return history
    .filter(h => h.provider === provider && h.date >= cutoffStr)
    .reduce(
      (acc, h) => ({ units: acc.units + h.units, cost: acc.cost + h.cost }),
      { units: 0, cost: 0 }
    );
}

/**
 * Calculates remaining balance for a provider.
 */
export function getRemainingBalance(provider: string): number | null {
  const history = loadAllHistory();
  
  // Load initial balance from legacy file or env
  let initial = Number(process.env[`INITIAL_${provider.toUpperCase()}_BALANCE`] || 0);
  
  if (fs.existsSync(LEGACY_USAGE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(LEGACY_USAGE_FILE, "utf-8"));
      if (data.initialBalances && data.initialBalances[provider]) {
        initial = data.initialBalances[provider];
      }
    } catch (e) { /* ignore */ }
  }
  
  if (initial === 0) return null;
  
  const totalCost = history
    .filter(h => h.provider === provider)
    .reduce((sum, h) => sum + h.cost, 0);

  return initial - totalCost;
}
