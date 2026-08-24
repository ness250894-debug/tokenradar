/**
 * Poll a TikTok Content Posting API publish_id.
 *
 * Usage:
 *   npx tsx scripts/check-tiktok-post-status.ts --publish-id <publish_id>
 */

import { classifyTikTokPostStatus, getTikTokPostStatus } from "../src/lib/tiktok-client";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const publishId = getArgValue("--publish-id") || process.env.TIKTOK_LAST_PUBLISH_ID;
  if (!publishId) {
    throw new Error("Provide --publish-id or set TIKTOK_LAST_PUBLISH_ID.");
  }

  const status = await getTikTokPostStatus(publishId);
  const reconciliation = classifyTikTokPostStatus(status);
  const nextAction = reconciliation.state === "published"
    ? "Record the public post ID and mark the delivery published."
    : reconciliation.state === "failed" && reconciliation.retrySafe
      ? "Record the failure, then retry only after the failed publish ID is preserved."
      : "Do not create another post. Poll this publish ID again or reconcile it in TikTok Studio.";
  console.log(JSON.stringify({ publishId, status, reconciliation, nextAction }, null, 2));
}

main().catch((error) => {
  console.error(`TikTok status check failed: ${formatErrorForLog(error)}`);
  process.exit(1);
});
