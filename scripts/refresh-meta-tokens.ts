/**
 * Meta Access Token Refresh
 *
 * Refreshes long-lived access tokens for Instagram and Threads.
 * Runs daily in the daily-refresh.yml workflow at 17:45 UTC,
 * 15 minutes before the 18:00 UTC video publishing slot.
 *
 * Meta tokens:
 *  - Expire after 60 days
 *  - Must be > 24 hours old to refresh
 *  - Refresh returns a new token (old one continues to work briefly)
 *
 * If refreshed, the new token is persisted back to GitHub Secrets
 * via `gh secret set`, following the same pattern as X OAuth rotation.
 *
 * Usage:
 *   npx tsx scripts/refresh-meta-tokens.ts
 *   npx tsx scripts/refresh-meta-tokens.ts --dry-run
 */

import { execSync } from "child_process";
import { loadEnv, formatErrorForLog } from "../src/lib/utils";
import { logError } from "../src/lib/reporter";

loadEnv();

interface TokenRefreshResult {
  platform: string;
  status: "refreshed" | "skipped" | "failed";
  expiresIn?: number;
  error?: string;
}

interface RefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}


/**
 * Check how many days until a token expires by inspecting it via the debug_token endpoint.
 */
async function getTokenExpiryDays(
  accessToken: string,
  platform: "instagram" | "threads",
): Promise<{ daysRemaining: number; isValid: boolean }> {
  const baseUrl = platform === "instagram"
    ? "https://graph.facebook.com/v21.0"
    : "https://graph.threads.net";

  try {
    // Try /me endpoint first to validate the token
    const meResponse = await fetch(
      `${baseUrl}/me?access_token=${accessToken}`,
    );
    const meData = await meResponse.json() as { id?: string; error?: { code: number } };

    if (meData.error) {
      return { daysRemaining: 0, isValid: false };
    }

    // For long-lived tokens, we can't easily determine the exact expiry without
    // a debug_token call (which requires an app token). As a heuristic, we'll
    // attempt a refresh and see if it succeeds — Meta rejects tokens < 24h old.
    // If we get a new token, it was old enough. If we get a "token too new" error,
    // the token is < 24h old and doesn't need refreshing anyway.
    return { daysRemaining: -1, isValid: true }; // -1 means "unknown, but valid"
  } catch {
    return { daysRemaining: 0, isValid: false };
  }
}

/**
 * Attempt to refresh a long-lived token.
 */
async function refreshToken(
  currentToken: string,
  platform: "instagram" | "threads",
): Promise<RefreshResponse> {
  let url = "";

  if (platform === "instagram") {
    // For Facebook User Tokens used by IG Graph API:
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    
    if (!appId || !appSecret) {
      throw new Error("META_APP_ID and META_APP_SECRET are required to refresh Instagram tokens.");
    }
    
    url = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`;
  } else {
    // For Threads API long-lived tokens
    url = `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${currentToken}`;
  }

  const response = await fetch(url);
  const data = await response.json() as RefreshResponse & { error?: { message: string; code: number } };

  if (!response.ok || (data as { error?: { message: string } }).error) {
    const errorData = data as { error: { message: string; code: number } };
    throw new Error(
      `Token refresh failed for ${platform}: ${errorData.error?.message || response.statusText} (HTTP ${response.status})`,
    );
  }

  return data;
}

/**
 * Persist a new token to GitHub Secrets using the gh CLI.
 */
function persistToGitHubSecrets(secretName: string, secretValue: string): boolean {
  const ghToken = process.env.GH_TOKEN;
  if (!ghToken) {
    console.warn(`  [meta-refresh] GH_TOKEN not set. Cannot persist ${secretName} to GitHub Secrets.`);
    return false;
  }

  try {
    execSync(`gh secret set ${secretName} --body "${secretValue}"`, {
      stdio: "pipe",
      env: { ...process.env, GH_TOKEN: ghToken },
    });
    console.log(`  [meta-refresh] Persisted ${secretName} to GitHub Secrets.`);
    return true;
  } catch (error) {
    console.error(`  [meta-refresh] Failed to persist ${secretName}: ${formatErrorForLog(error)}`);
    return false;
  }
}

/**
 * Report results to the Telegram ops channel.
 */
async function reportToTelegram(results: TokenRefreshResult[]): Promise<void> {
  const botToken = process.env.TELEGRAM_REPORT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_REPORT_CHAT_ID;
  if (!botToken || !chatId) return;

  const lines = ["🔑 *Meta Token Refresh Report*", ""];

  for (const result of results) {
    const emoji = result.status === "refreshed" ? "✅" : result.status === "skipped" ? "⏭" : "⚠️";
    let line = `${emoji} *${result.platform}*: ${result.status}`;
    if (result.expiresIn) {
      const days = Math.floor(result.expiresIn / 86400);
      line += ` (expires in ${days} days)`;
    }
    if (result.error) {
      line += `\n   _${result.error}_`;
    }
    lines.push(line);
  }

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        parse_mode: "Markdown",
      }),
    });
  } catch {
    // Non-critical: don't crash if Telegram reporting fails
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  console.log("==========================================");
  console.log("  Meta Access Token Refresh");
  console.log("==========================================");
  console.log();
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log();

  const platforms = [
    {
      name: "Instagram",
      platform: "instagram" as const,
      envTokenKey: "IG_ACCESS_TOKEN",
      secretName: "IG_ACCESS_TOKEN",
    },
    {
      name: "Threads",
      platform: "threads" as const,
      envTokenKey: "THREADS_ACCESS_TOKEN",
      secretName: "THREADS_ACCESS_TOKEN",
    },
  ];

  const results: TokenRefreshResult[] = [];

  for (const { name, platform, envTokenKey, secretName } of platforms) {
    const currentToken = process.env[envTokenKey];

    if (!currentToken) {
      console.log(`  [${name}] No token configured. Skipping.`);
      results.push({ platform: name, status: "skipped", error: "No token configured" });
      continue;
    }

    console.log(`  [${name}] Checking token validity...`);

    const { isValid } = await getTokenExpiryDays(currentToken, platform);

    if (!isValid) {
      console.error(`  [${name}] ⚠️ Token is INVALID or EXPIRED. Manual re-authorization required.`);
      results.push({ platform: name, status: "failed", error: "Token invalid/expired — manual re-auth needed" });
      continue;
    }

    console.log(`  [${name}] Token is valid. Attempting refresh...`);

    if (dryRun) {
      console.log(`  [${name}] DRY RUN — would attempt refresh here.`);
      results.push({ platform: name, status: "skipped", error: "Dry run mode" });
      continue;
    }

    try {
      const newToken = await refreshToken(currentToken, platform);
      console.log(`  [${name}] ✅ Token refreshed. New expiry: ${Math.floor(newToken.expires_in / 86400)} days.`);

      // Set the new token in the current process environment
      process.env[envTokenKey] = newToken.access_token;

      // Export to GITHUB_ENV for downstream workflow steps
      if (process.env.GITHUB_ENV) {
        const fs = await import("fs");
        fs.appendFileSync(process.env.GITHUB_ENV, `NEW_${secretName}=${newToken.access_token}\n`);
      }

      // Also try direct persistence via gh CLI
      persistToGitHubSecrets(secretName, newToken.access_token);

      results.push({
        platform: name,
        status: "refreshed",
        expiresIn: newToken.expires_in,
      });
    } catch (error) {
      const errorMsg = formatErrorForLog(error);
      console.warn(`  [${name}] ⚠️ Refresh failed: ${errorMsg}`);
      console.warn(`  [${name}] Token may still be valid — it could be too new to refresh (<24h old).`);

      results.push({
        platform: name,
        status: "failed",
        error: errorMsg.slice(0, 200),
      });
    }
  }

  // Report results
  console.log();
  console.log("Summary:");
  for (const result of results) {
    console.log(`  ${result.platform}: ${result.status}${result.error ? ` (${result.error})` : ""}`);
  }

  // Report to Telegram
  const hasFailures = results.some((r) => r.status === "failed");
  if (hasFailures) {
    await reportToTelegram(results);
  }
}

main().catch(async (error) => {
  await logError("refresh-meta-tokens", error);
  // Don't exit with error code — token refresh failure shouldn't crash the entire daily-refresh workflow
  console.error(`Meta token refresh failed: ${formatErrorForLog(error)}`);
});
