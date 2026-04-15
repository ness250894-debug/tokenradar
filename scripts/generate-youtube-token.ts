/**
 * TokenRadar — OAuth 2.0 Token Generator for YouTube API
 *
 * One-time interactive script to obtain a YouTube Refresh Token.
 *
 * Usage:
 *   npx tsx scripts/generate-youtube-token.ts
 *
 * Prerequisites:
 *   1. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env.local
 *   2. Configure Redirect URI as http://localhost:3000 in the Google Cloud Console
 *
 * After completing the flow, your .env.local will be updated automatically.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL, fileURLToPath } from "node:url";
import { google } from "googleapis";

// ── Env Setup ──────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ── Config ─────────────────────────────────────────────────────

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
];

// ── Validation ─────────────────────────────────────────────────

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("✗ Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET in .env.local");
  console.log("  Please add them first from the Google Cloud Console (APIs & Services > Credentials)");
  process.exit(1);
}

// ── Main Flow ──────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  TokenRadar — YouTube Token Generator       ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline", // Required to get a refresh token
    scope: SCOPES,
    prompt: "consent",      // Force consent to ensure refresh token is provided
  });

  console.log("▶ Step 1: Open this URL in your browser to authorize:\n");
  console.log(`  ${authUrl}\n`);
  console.log("▶ Step 2: After authorizing, you'll be redirected to http://localhost:3000.");
  console.log("  Waiting for callback...\n");

  try {
    const authCode = await waitForCallback();

    console.log(`  ✓ Authorization code received.\n`);
    console.log("▶ Step 3: Exchanging code for tokens...\n");

    const { tokens } = await oauth2Client.getToken(authCode);
    
    if (!tokens.refresh_token) {
      console.warn("  ⚠ Warning: No refresh token returned. This usually happens if you didn't see the 'consent' screen.");
      console.warn("  Try removing the app from your Google account settings and running this script again.");
    }

    // Auto-save the refresh token to .env.local
    const envPath = path.resolve(__dirname, "../.env.local");
    let envContent = fs.readFileSync(envPath, "utf-8");
    
    if (tokens.refresh_token) {
      if (envContent.includes("YOUTUBE_REFRESH_TOKEN=")) {
        envContent = envContent.replace(
          /^YOUTUBE_REFRESH_TOKEN=.*/m,
          `YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`
        );
      } else {
        envContent += `\nYOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
      }
      fs.writeFileSync(envPath, envContent, "utf-8");
    }

    console.log("═══════════════════════════════════════════════");
    console.log("  ✓ SUCCESS! Tokens obtained.\n");
    if (tokens.refresh_token) {
      console.log("  ✓ Refresh token auto-saved to .env.local\n");
    }
    console.log(`  Access Token (expires in ${tokens.expiry_date ? Math.round((tokens.expiry_date - Date.now()) / 1000) : 'unknown'}s):`);
    console.log(`  ${tokens.access_token?.substring(0, 40)}...`);
    console.log("\n═══════════════════════════════════════════════");
    console.log("  Check your .env.local and verify YOUTUBE_REFRESH_TOKEN is set.");
    console.log("═══════════════════════════════════════════════");
  } catch (error) {
    console.error("  ✗ Token exchange failed:", error);
    process.exit(1);
  }
}

// ── Callback Server ────────────────────────────────────────────

function waitForCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const code = reqUrl.searchParams.get("code");
      const error = reqUrl.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Authorization Error</h1><p>${error}</p>`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Invalid callback</h1><p>Missing code parameter.</p>");
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
      // Server started
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
