/**
 * TokenRadar Reporting Hub
 * 
 * Centralized utility for:
 * 1. Immediate error reporting to Telegram.
 * 2. API usage tracking (daily buckets) for cost analysis.
 * 3. Balance/Budget monitoring.
 */

export const MONTHLY_LIMIT = 9000;

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fetchWithRetry } from "./fetch-with-retry";

const DATA_DIR = path.resolve(process.cwd(), "data");
const LOGS_DIR = path.join(DATA_DIR, "logs");
const ERRORS_DIR = path.join(LOGS_DIR, "errors");
const ACTIVITIES_DIR = path.join(LOGS_DIR, "activities");

// Ensure directories exist
[LOGS_DIR, ERRORS_DIR, ACTIVITIES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * Simple rate limiter for Telegram alerts.
 * Max 5 alerts per 60 seconds to prevent flooding during cascade failures.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const alertTimestamps: number[] = [];

/**
 * Sends a notification to Telegram.
 * Rate-limited to prevent cascade flooding (max 5 per 60s).
 */
export async function sendTelegramAlert(message: string): Promise<void> {
  const token = process.env.TELEGRAM_REPORT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_REPORT_CHAT_ID;

  if (!token || !chatId) {
    console.warn("  [reporter] TELEGRAM_REPORT_BOT_TOKEN or TELEGRAM_REPORT_CHAT_ID not set.");
    return;
  }

  // Enforce rate limit
  const now = Date.now();
  const recentAlerts = alertTimestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recentAlerts.length >= RATE_LIMIT_MAX) {
    console.warn(`  [reporter] Telegram rate limit reached (${RATE_LIMIT_MAX}/${RATE_LIMIT_WINDOW_MS / 1000}s). Skipping alert.`);
    return;
  }
  alertTimestamps.push(now);
  // Prune old timestamps
  while (alertTimestamps.length > 0 && now - alertTimestamps[0] > RATE_LIMIT_WINDOW_MS) {
    alertTimestamps.shift();
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const response = await fetchWithRetry(url, {
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
export async function logError(source: string, error: unknown, isFatal = true): Promise<void> {
  const errorMsg = error instanceof Error ? error.stack || error.message : String(error);
  const timestamp = new Date().toISOString();
  const id = crypto.randomUUID().substring(0, 8);

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
 * Logs a non-error system activity (e.g., generated a post, reformatted an article)
 * for the daily System Report aggregation.
 */
export function logActivity(type: string, details: Record<string, string | number | boolean | null | undefined>): void {
  const timestamp = new Date().toISOString();
  const id = Math.random().toString(36).substring(2, 8);
  const activityRecord = { timestamp, type, ...details };

  const activityFile = path.join(ACTIVITIES_DIR, `${timestamp.replace(/[:.]/g, "-")}-${type}-${id}.json`);
  fs.writeFileSync(activityFile, JSON.stringify(activityRecord, null, 2));

  console.log(`  [reporter] Activity logged: ${type} - ${JSON.stringify(details).substring(0, 50)}...`);
}

/**
 * Helper to fetch the current monthly CoinGecko usage from the cache counter.
 */
export function getApiQuota(): { month: string; count: number } {
  const counterFile = path.join(DATA_DIR, "cache", "api-counter.json");
  if (!fs.existsSync(counterFile)) {
    return { month: new Date().toISOString().substring(0, 7), count: 0 };
  }
  try {
    return JSON.parse(fs.readFileSync(counterFile, "utf-8"));
  } catch {
    return { month: new Date().toISOString().substring(0, 7), count: 0 };
  }
}

