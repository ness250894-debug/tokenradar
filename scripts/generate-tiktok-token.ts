/**
 * TokenRadar TikTok OAuth helper.
 *
 * Usage:
 *   npx tsx scripts/generate-tiktok-token.ts
 *   npx tsx scripts/generate-tiktok-token.ts --code <redirect_code>
 *
 * Configure the same TIKTOK_REDIRECT_URI in .env.local and the TikTok
 * Developer Portal. The default static callback page is /tiktok/callback.
 */

import * as fs from "fs";
import * as path from "path";

import {
  buildTikTokAuthUrl,
  exchangeTikTokAuthorizationCode,
  getTikTokCredentialMode,
  TIKTOK_BASIC_USER_SCOPE,
  TIKTOK_PUBLISH_SCOPE,
  TIKTOK_UPLOAD_SCOPE,
} from "../src/lib/tiktok-client";
import { formatErrorForLog, loadEnv, writeFileAtomicSync } from "../src/lib/utils";

loadEnv();

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : undefined;
}

function upsertEnvValue(envPath: string, key: string, value: string): void {
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=.*$`, "m").test(content)) {
    content = content.replace(new RegExp(`^${key}=.*$`, "m"), line);
  } else {
    content = `${content.trimEnd()}\n${line}\n`;
  }
  writeFileAtomicSync(envPath, content);
}

async function main(): Promise<void> {
  const code = getArgValue("--code");
  const requestedMode = getArgValue("--env") || getArgValue("--mode");
  if (
    requestedMode &&
    !["sandbox", "sand", "inbox", "upload", "production", "prod", "direct"].includes(requestedMode)
  ) {
    throw new Error("Invalid --env/--mode. Expected sandbox or production.");
  }
  const mode = requestedMode === "production" || requestedMode === "prod" || requestedMode === "direct"
    ? "production"
    : requestedMode
      ? "sandbox"
      : getTikTokCredentialMode();
  const scopes = [
    TIKTOK_BASIC_USER_SCOPE,
    mode === "production" ? TIKTOK_PUBLISH_SCOPE : TIKTOK_UPLOAD_SCOPE,
  ];
  const state = `tokenradar-tiktok-${Date.now()}`;

  if (!code) {
    const url = buildTikTokAuthUrl({
      scopes,
      state,
    });
    console.log(`Open this TikTok ${mode} authorization URL:`);
    console.log(url);
    console.log();
    console.log("After authorization, copy the code query parameter from the redirect URL and run:");
    console.log(`npx tsx scripts/generate-tiktok-token.ts --env ${mode} --code <code>`);
    return;
  }

  const tokens = await exchangeTikTokAuthorizationCode(code);
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (tokens.refresh_token) {
    upsertEnvValue(envPath, "TIKTOK_REFRESH_TOKEN", tokens.refresh_token);
  }
  upsertEnvValue(envPath, "TIKTOK_ACCESS_TOKEN", tokens.access_token);
  upsertEnvValue(envPath, "TIKTOK_ENV", mode);

  console.log("TikTok tokens obtained.");
  console.log(`Open ID: ${tokens.open_id}`);
  console.log(`Mode: ${mode}`);
  console.log(`Requested scopes: ${scopes.join(",")}`);
  console.log(`Returned scopes: ${tokens.scope || "(not returned)"}`);
  console.log(`Access token expires in: ${tokens.expires_in}s`);
  if (tokens.refresh_token) {
    console.log("Refresh token saved to .env.local as TIKTOK_REFRESH_TOKEN.");
  }
}

main().catch((error) => {
  console.error(`TikTok token generation failed: ${formatErrorForLog(error)}`);
  process.exit(1);
});
