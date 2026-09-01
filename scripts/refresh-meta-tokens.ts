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

function formatTelegramText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

async function reportToTelegram(results: TokenRefreshResult[]): Promise<void> {
  const lines = ["🔑 Meta Token Maintenance Report", ""];

  for (const result of results) {
    const emoji = result.status === "failed"
      ? "⚠️"
      : result.status === "skipped"
        ? "⏭"
        : "✅";
    let line = `${emoji} ${result.platform}: ${result.status}`;
    if (result.expiresIn !== undefined) {
      line += ` (expires in ${Math.floor(result.expiresIn / 86_400)} days)`;
    }
    if (result.detail) line += `\n   ${formatTelegramText(result.detail)}`;
    if (result.error) line += `\n   ${formatTelegramText(result.error)}`;
    lines.push(line);
  }

  const delivered = await sendTelegramAlert(lines.join("\n"), { parseMode: "plain" });
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
      const error = `${platform.envTokenKey} is required for Meta token maintenance.`;
      console.error(`  [${platform.name}] ${error}`);
      results.push({
        platform: platform.name,
        status: "failed",
        error,
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

export async function runMetaTokenMaintenanceCommand(): Promise<number> {
  const results = await runMetaTokenMaintenance();
  if (results.some((result) => result.status === "failed")) {
    console.error("Meta token maintenance completed with one or more failures.");
    return 1;
  }
  return 0;
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  runMetaTokenMaintenanceCommand()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch(async (error) => {
      await logError("refresh-meta-tokens", error);
      console.error(`Meta token maintenance failed: ${formatErrorForLog(error)}`);
      process.exitCode = 1;
    });
}
