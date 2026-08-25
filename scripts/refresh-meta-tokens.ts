/**
 * Maintain Instagram and Threads access tokens.
 *
 * Instagram supports two explicit authentication families:
 * - facebook_login: validate a durable Page/System User token, or convert a
 *   Facebook User token once to the linked non-expiring Page token.
 * - instagram_login: renew a long-lived Instagram User token with
 *   grant_type=ig_refresh_token.
 *
 * Any newly issued token is validated before it replaces the corresponding
 * GitHub Actions secret. Persistence failures are fatal.
 *
 * Usage:
 *   npx tsx scripts/refresh-meta-tokens.ts
 *   npx tsx scripts/refresh-meta-tokens.ts --dry-run
 */

import { pathToFileURL } from "url";

import {
  maintainInstagramAccessToken,
  maintainThreadsAccessToken,
  type TokenMaintenanceResult,
} from "../src/lib/meta-token-maintenance";
import { resolveInstagramAuthMode } from "../src/lib/instagram-auth";
import { persistGitHubActionsSecret } from "../src/lib/github-secret";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";
import { logError, sendTelegramAlert } from "../src/lib/reporter";

loadEnv();

interface TokenRefreshResult {
  platform: string;
  status: TokenMaintenanceResult["status"] | "failed";
  expiresIn?: number;
  detail?: string;
  error?: string;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([_*[\]()`])/g, "\\$1");
}

async function reportToTelegram(results: TokenRefreshResult[]): Promise<void> {
  const lines = ["🔑 *Meta Token Maintenance Report*", ""];

  for (const result of results) {
    const emoji = result.status === "failed"
      ? "⚠️"
      : result.status === "skipped"
        ? "⏭"
        : "✅";
    let line = `${emoji} *${result.platform}*: ${result.status}`;
    if (result.expiresIn !== undefined) {
      line += ` (expires in ${Math.floor(result.expiresIn / 86_400)} days)`;
    }
    if (result.detail) line += `\n   _${escapeMarkdown(result.detail)}_`;
    if (result.error) line += `\n   _${escapeMarkdown(result.error)}_`;
    lines.push(line);
  }

  const delivered = await sendTelegramAlert(lines.join("\n"));
  if (!delivered) console.warn("  [meta-refresh] Telegram report was not delivered.");
}

async function maintainPlatform(
  name: "Instagram" | "Threads",
  currentToken: string,
): Promise<TokenMaintenanceResult> {
  return name === "Instagram"
    ? maintainInstagramAccessToken(currentToken, process.env)
    : maintainThreadsAccessToken(currentToken, process.env);
}

export async function runMetaTokenMaintenance(): Promise<TokenRefreshResult[]> {
  const dryRun = process.argv.includes("--dry-run");
  const platforms = [
    {
      name: "Instagram" as const,
      envTokenKey: "IG_ACCESS_TOKEN",
      secretName: "IG_ACCESS_TOKEN",
    },
    {
      name: "Threads" as const,
      envTokenKey: "THREADS_ACCESS_TOKEN",
      secretName: "THREADS_ACCESS_TOKEN",
    },
  ];

  console.info("==========================================");
  console.info("  Meta Access Token Maintenance");
  console.info("==========================================");
  console.info(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.info(`  Instagram auth: ${resolveInstagramAuthMode(process.env)}`);

  const results: TokenRefreshResult[] = [];
  for (const platform of platforms) {
    const currentToken = process.env[platform.envTokenKey]?.trim();
    if (!currentToken) {
      console.info(`  [${platform.name}] No token configured. Skipping.`);
      results.push({
        platform: platform.name,
        status: "skipped",
        detail: "No token configured.",
      });
      continue;
    }

    if (dryRun) {
      console.info(`  [${platform.name}] DRY RUN - token is configured; no API or secret write attempted.`);
      results.push({
        platform: platform.name,
        status: "skipped",
        detail: "Dry run; no API or secret write attempted.",
      });
      continue;
    }

    console.info(`  [${platform.name}] Validating token lifecycle...`);
    try {
      const maintenance = await maintainPlatform(platform.name, currentToken);
      if (maintenance.accessToken) {
        // GitHub interprets this workflow command, but a local terminal would
        // print the secret verbatim. Emit it only inside GitHub Actions.
        if (process.env.GITHUB_ACTIONS === "true") {
          console.info(`::add-mask::${maintenance.accessToken}`);
        }
        persistGitHubActionsSecret(
          platform.secretName,
          maintenance.accessToken,
          process.env,
        );
        process.env[platform.envTokenKey] = maintenance.accessToken;
      }

      console.info(`  [${platform.name}] ${maintenance.detail}`);
      results.push({
        platform: platform.name,
        status: maintenance.status,
        expiresIn: maintenance.expiresIn,
        detail: maintenance.detail,
      });
    } catch (error) {
      const errorMessage = formatErrorForLog(error);
      console.error(`  [${platform.name}] ${errorMessage}`);
      results.push({
        platform: platform.name,
        status: "failed",
        error: errorMessage.slice(0, 300),
      });
    }
  }

  console.info("Summary:");
  for (const result of results) {
    console.info(`  ${result.platform}: ${result.status}`);
  }

  if (results.some(
    (result) => result.status === "failed" || result.expiresIn !== undefined,
  )) {
    await reportToTelegram(results);
  }
  return results;
}

async function main(): Promise<void> {
  const results = await runMetaTokenMaintenance();
  if (results.some((result) => result.status === "failed")) {
    throw new Error("One or more Meta tokens could not be maintained.");
  }
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  main().catch(async (error) => {
    await logError("refresh-meta-tokens", error);
    console.error(`Meta token maintenance failed: ${formatErrorForLog(error)}`);
    process.exitCode = 1;
  });
}
