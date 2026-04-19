/**
 * TokenRadar — OAuth 2.0 PKCE Token Generator for X API
 *
 * One-time interactive script to obtain OAuth 2.0 access + refresh tokens
 * via the Authorization Code Flow with PKCE.
 *
 * Usage:
 *   npx tsx scripts/generate-x-token.ts
 *
 * Prerequisites:
 *   1. Set X_OAUTH2_CLIENT_ID and X_OAUTH2_CLIENT_SECRET in .env.local
 *   2. Configure Redirect URI as http://127.0.0.1:3000 in the X Developer Portal
 *
 * After completing the flow, add the printed REFRESH_TOKEN to your .env.local
 * as X_OAUTH2_REFRESH_TOKEN.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL, fileURLToPath } from "node:url";
import {
  OAuth2,
  generateCodeVerifier,
  generateCodeChallenge,
  type OAuth2Config,
} from "@xdevplatform/xdk";

// ── Env Setup ──────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ── Config ─────────────────────────────────────────────────────

const CLIENT_ID = process.env.X_OAUTH2_CLIENT_ID;
const CLIENT_SECRET = process.env.X_OAUTH2_CLIENT_SECRET;
const REDIRECT_URI = "http://127.0.0.1:3000";

const SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",      // Required for refresh tokens
  "media.write",         // Required for media uploads
];

// ── Validation ─────────────────────────────────────────────────

if (!CLIENT_ID) {
  console.error("✗ Missing X_OAUTH2_CLIENT_ID in .env.local");
  process.exit(1);
}
// Client Secret is intentionally optional for PKCE Public Client flows
if (CLIENT_SECRET) {
  console.info("ℹ Client Secret found, but PKCE flow on X often prefers Public Client behavior. We will omit it to prevent header errors.");
}

// ── Main Flow ──────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  TokenRadar — X OAuth 2.0 Token Generator   ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Step 1: Generate PKCE credentials
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const oauth2Config: OAuth2Config = {
    clientId: CLIENT_ID!,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    scope: SCOPES,
  };

  const oauth2 = new OAuth2(oauth2Config);
  oauth2.setPkceParameters(codeVerifier, codeChallenge);

  const state = `tokenradar-${Date.now()}`;
  const authUrl = await oauth2.getAuthorizationUrl(state);

  console.log("▶ Step 1: Open this URL in your browser to authorize:\n");
  console.log(`  ${authUrl}\n`);
  console.log("▶ Step 2: After authorizing, you'll be redirected to http://127.0.0.1:3000.");
  console.log("  Waiting for callback...\n");

  // Step 2: Start local server to capture the callback
  const authCode = await waitForCallback(state);

  console.log(`  ✓ Authorization code received.\n`);
  console.log("▶ Step 3: Exchanging code for tokens...\n");

  // Step 3: Exchange code for tokens
  try {
    const tokens = await oauth2.exchangeCode(authCode, codeVerifier);

    // Auto-save the refresh token to .env.local
    const envPath = path.resolve(__dirname, "../.env.local");
    let envContent = fs.readFileSync(envPath, "utf-8");
    if (envContent.includes("X_OAUTH2_REFRESH_TOKEN=")) {
      envContent = envContent.replace(
        /^X_OAUTH2_REFRESH_TOKEN=.*/m,
        `X_OAUTH2_REFRESH_TOKEN=${tokens.refresh_token}`
      );
    } else {
      envContent += `\nX_OAUTH2_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    }
    fs.writeFileSync(envPath, envContent, "utf-8");

    console.log("═══════════════════════════════════════════════");
    console.log("  ✓ SUCCESS! Tokens obtained.\n");
    console.log("  ✓ Refresh token auto-saved to .env.local\n");
    console.log(`  Access Token (expires in ${tokens.expires_in}s):`);
    console.log(`  ${tokens.access_token?.substring(0, 40)}...`);
    console.log(`\n  Scopes: ${tokens.scope}`);
    console.log("\n═══════════════════════════════════════════════");
    console.log("  You're all set! No manual steps needed.");
    console.log("═══════════════════════════════════════════════");
  } catch (error) {
    console.error("  ✗ Token exchange failed:", error);
    process.exit(1);
  }
}

// ── Callback Server ────────────────────────────────────────────

function waitForCallback(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const code = reqUrl.searchParams.get("code");
      const state = reqUrl.searchParams.get("state");
      const error = reqUrl.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Authorization Error</h1><p>${error}</p>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code || state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Invalid callback</h1><p>Missing code or state mismatch.</p>");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<h1>TokenRadar — Authorization Complete!</h1>" +
        "<p>You can close this tab and return to the terminal.</p>"
      );

      server.close();
      resolve(code);
    });

    server.listen(3000, "127.0.0.1", () => {
      // Server started, waiting for callback
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Timeout: No callback received within 5 minutes."));
    }, 5 * 60 * 1000);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
