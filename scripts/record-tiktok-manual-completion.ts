/**
 * Record the final human TikTok publish step for a sandbox manual handoff.
 *
 * Usage:
 *   npx tsx scripts/record-tiktok-manual-completion.ts --date 2026-05-18 --url https://www.tiktok.com/@tokenradarco/video/... --operator Pavlo
 */

import * as fs from "fs";
import * as path from "path";

import { recordSocialPost } from "../src/lib/ops-ledger";
import {
  recordTikTokManualCompletion,
  type TikTokManualCompletionTracker,
} from "../src/lib/tiktok-manual-completion";
import { loadEnv, safeReadJson, writeFileAtomicSync } from "../src/lib/utils";

loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");

function getArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
}

function dateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getVideoSocialPostKey(today: string, tokenId: string, platform: string): string {
  return `${today}:video:${tokenId}:${platform}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const date = getArgValue(args, "--date") || dateKey(new Date());
  const operator = getArgValue(args, "--operator") || process.env.USER || process.env.USERNAME || "";
  const tiktokUrl = getArgValue(args, "--url");
  const postId = getArgValue(args, "--post-id");
  const publishedAt = getArgValue(args, "--published-at");
  const trackerFile = path.join(DATA_DIR, "posted_video", date, "daily-video.json");

  if (!fs.existsSync(trackerFile)) {
    throw new Error(`Daily video tracker not found: ${trackerFile}`);
  }

  const tracker = safeReadJson<TikTokManualCompletionTracker | null>(trackerFile, null);
  if (!tracker?.platforms) {
    throw new Error(`Daily video tracker is invalid: ${trackerFile}`);
  }

  const updated = recordTikTokManualCompletion(tracker, {
    operator,
    publishedAt,
    tiktokUrl,
    postId,
  });
  writeFileAtomicSync(trackerFile, `${JSON.stringify(updated, null, 2)}\n`);

  if (updated.tokenId) {
    const tiktok = updated.platforms.tiktok || {};
    await recordSocialPost({
      platform: "tiktok",
      contentKey: getVideoSocialPostKey(date, updated.tokenId, "tiktok"),
      externalId: typeof tiktok.postId === "string" ? tiktok.postId : typeof tiktok.tiktokUrl === "string" ? tiktok.tiktokUrl : undefined,
      postedAt: typeof tiktok.manualPublishedAt === "string" ? tiktok.manualPublishedAt : publishedAt,
      details: {
        tokenId: updated.tokenId,
        tokenName: updated.tokenName,
        status: "manual_published",
        deliveryMode: "telegram-report-manual",
        humanOperator: operator,
        tiktokUrl,
        postId,
        variantSurface: "video",
      },
    });
  }

  console.log(`Recorded TikTok manual completion for ${date}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
