/**
 * TokenRadar environment variable validation script.
 * Ensures all required environment variables are present before build.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const REQUIRED_VARS = [
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "X_OAUTH2_CLIENT_ID",
  "X_OAUTH2_CLIENT_SECRET",
  "X_OAUTH2_REFRESH_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHANNEL_ID",
  "TELEGRAM_REPORT_BOT_TOKEN",
  "TELEGRAM_REPORT_CHAT_ID",
  "NEXT_PUBLIC_SITE_URL"
];

const missing = REQUIRED_VARS.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.error("\x1b[31m%s\x1b[0m", "🚨 Missing required environment variables:");
  missing.forEach(v => console.error(`   - ${v}`));
  console.error("\x1b[33m%s\x1b[0m", "\nCheck .env.local and ensure all keys are set.");
  process.exit(1);
}

console.log("\x1b[32m%s\x1b[0m", "✅ Environment variables validated.");
