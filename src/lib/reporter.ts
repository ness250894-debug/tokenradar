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

// Ensure directories exist
[LOGS_DIR, ERRORS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

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
export async function logError(source: string, error: unknown, isFatal = true): Promise<void> {
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


