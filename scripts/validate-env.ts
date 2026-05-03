/**
 * TokenRadar environment variable validation script.
 * Ensures all required environment variables are present before build.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load environment variables from .env and .env.local
const envFiles = [".env", ".env.local"];

envFiles.forEach(file => {
  const envPath = path.resolve(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
});

// Variables strictly required for the static build (sitemap, relative paths, etc.)
const BUILD_REQUIRED = [
  "NEXT_PUBLIC_SITE_URL"
];

// Variables required for functional scripts (generation, agents, etc.)
const FUNCTIONAL_REQUIRED = [
  "ANTHROPIC_API_KEY",
  "COINGECKO_API_KEY",
  "GEMINI_API_KEY",
  "X_OAUTH2_CLIENT_ID",
  "X_OAUTH2_CLIENT_SECRET",
  "X_OAUTH2_REFRESH_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHANNEL_ID",
  "TELEGRAM_REPORT_BOT_TOKEN",
  "TELEGRAM_REPORT_CHAT_ID",
];

const FORMAT_RULES: Record<string, { test: (value: string) => boolean; message: string; fatal?: boolean }> = {
  NEXT_PUBLIC_SITE_URL: {
    test: (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    },
    message: "must be a valid http(s) URL",
    fatal: true,
  },
  COINGECKO_API_KEY: {
    test: (value) => value.startsWith("CG-") || value.length >= 20,
    message: "should look like a CoinGecko demo key (CG-...) or a long pro key",
  },
  TELEGRAM_BOT_TOKEN: {
    test: (value) => /^\d+:[A-Za-z0-9_-]{20,}$/.test(value),
    message: "must match the Telegram bot token format",
  },
  TELEGRAM_REPORT_BOT_TOKEN: {
    test: (value) => /^\d+:[A-Za-z0-9_-]{20,}$/.test(value),
    message: "must match the Telegram bot token format",
  },
  X_OAUTH2_CLIENT_ID: {
    test: (value) => value.length >= 10,
    message: "looks too short for an X OAuth client id",
  },
  X_OAUTH2_REFRESH_TOKEN: {
    test: (value) => value.length >= 20,
    message: "looks too short for an X OAuth refresh token",
  },
};

const missingBuild = BUILD_REQUIRED.filter(v => !process.env[v]);
const missingFunctional = FUNCTIONAL_REQUIRED.filter(v => !process.env[v]);
const invalidFormats = Object.entries(FORMAT_RULES)
  .filter(([name, rule]) => process.env[name] && !rule.test(process.env[name]!))
  .map(([name, rule]) => ({ name, ...rule }));

if (missingBuild.length > 0) {
  console.error("\x1b[31m%s\x1b[0m", "🚨 Missing BUILD-CRITICAL environment variables:");
  missingBuild.forEach(v => console.error(`   - ${v}`));
  console.error("\x1b[33m%s\x1b[0m", "\nThese are required for a successful static build. Please set them.");
  process.exit(1);
}

if (missingFunctional.length > 0) {
  console.warn("\x1b[33m%s\x1b[0m", "⚠️  Missing functional environment variables (Optional for build):");
  missingFunctional.forEach(v => console.warn(`   - ${v}`));
  console.warn("\x1b[36m%s\x1b[0m", "\nBuild will proceed, but content generation or social agents may fail.");
}

if (invalidFormats.length > 0) {
  const fatalInvalidFormats = invalidFormats.filter((entry) => entry.fatal);
  const warnInvalidFormats = invalidFormats.filter((entry) => !entry.fatal);

  if (fatalInvalidFormats.length > 0) {
    console.error("\x1b[31m%s\x1b[0m", "Invalid BUILD-CRITICAL environment variable formats:");
    fatalInvalidFormats.forEach((entry) => console.error(`   - ${entry.name}: ${entry.message}`));
    process.exit(1);
  }

  if (warnInvalidFormats.length > 0) {
    console.warn("\x1b[33m%s\x1b[0m", "Environment variable format warnings:");
    warnInvalidFormats.forEach((entry) => console.warn(`   - ${entry.name}: ${entry.message}`));
  }
}

console.log("\x1b[32m%s\x1b[0m", "✅ Environment variables validated.");
