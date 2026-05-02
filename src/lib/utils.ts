/**
 * Server-side Utilities — TokenRadar
 *
 * Utility functions that require Node.js built-ins (like 'fs').
 * Do NOT import this file into Client Components.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

import type { ZodType } from "zod";

const SENSITIVE_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "COINGECKO_API_KEY",
  "CLOUDFLARE_API_TOKEN",
  "GEMINI_API_KEY",
  "REDDIT_CLIENT_SECRET",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_REPORT_BOT_TOKEN",
  "X_BEARER_TOKEN",
  "X_OAUTH2_CLIENT_SECRET",
  "X_OAUTH2_REFRESH_TOKEN",
  "YOUTUBE_CLIENT_SECRET",
  "YOUTUBE_REFRESH_TOKEN",
] as const;

/**
 * Read and parse a JSON file safely. Returns the fallback value
 * if the file is missing, empty, or contains invalid JSON.
 *
 * @param filePath - Absolute path to the JSON file
 * @param fallback - Value to return on failure
 * @param schema - Optional Zod schema to validate the parsed JSON
 * @returns Parsed JSON data or fallback
 */
export function safeReadJson<T>(filePath: string, fallback: T, schema?: ZodType<T>): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) return fallback;
    const parsed = JSON.parse(raw) as T;
    
    if (schema) {
      const result = schema.safeParse(parsed);
      if (!result.success) {
        console.warn(`  [warn] Schema validation failed for ${filePath}:`, result.error.message);
        return fallback;
      }
      return result.data;
    }
    
    return parsed;
  } catch (e) {
    console.warn(`  [warn] Failed to parse ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return fallback;
  }
}

/**
 * Robustly load environment variables from .env.local by searching upward from the current directory.
 * Useful for scripts running from different subdirectories.
 */
export function loadEnv(): void {
  const envPaths = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "..", ".env.local"),
    path.resolve(__dirname, "..", "..", ".env.local"), // Relative to src/lib
  ];

  let loaded = false;
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      loaded = true;
      break;
    }
  }

  if (!loaded && process.env.NODE_ENV !== "production") {
    // In production (Cloudflare), env vars are provided by the platform.
    // In local dev, we expect a .env.local.
    console.warn("  [warn] No .env.local found. Using system environment variables.");
  }
}

/**
 * Ensure a directory exists. Sync version.
 */
export function ensureDirSync(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Redact obvious credentials from logs, alerts, and persisted error records.
 */
export function redactSensitiveText(text: string): string {
  let redacted = text;

  for (const key of SENSITIVE_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.length >= 6) {
      redacted = redacted.split(value).join(`[REDACTED:${key}]`);
    }
  }

  redacted = redacted.replace(
    /https:\/\/api\.telegram\.org\/bot[0-9A-Za-z:_-]+/gi,
    "https://api.telegram.org/bot[REDACTED]",
  );
  redacted = redacted.replace(
    /([?&](?:api[_-]?key|client_secret|key|refresh_token|token)=)([^&\s]+)/gi,
    "$1[REDACTED]",
  );
  redacted = redacted.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");

  return redacted;
}

/**
 * Normalize an error for safe logging without leaking tokens or API keys.
 */
export function formatErrorForLog(error: unknown): string {
  const raw = error instanceof Error ? error.stack || error.message : String(error);
  return redactSensitiveText(raw);
}
