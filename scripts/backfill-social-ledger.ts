import * as path from "path";

import { isOpsLedgerEnabled, recordSocialPost } from "../src/lib/ops-ledger";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";
import { collectBackfillSocialPosts } from "./lib/social-ledger-backfill";

loadEnv();

const DATA_DIR = path.resolve(process.cwd(), "data");

async function main(): Promise<void> {
  if (!isOpsLedgerEnabled()) {
    console.log("D1 ops ledger is not configured; skipping social ledger backfill.");
    return;
  }

  const records = collectBackfillSocialPosts(DATA_DIR);
  for (const record of records) {
    await recordSocialPost(record);
  }

  console.log(`Backfilled ${records.length} social post tracker record(s) into D1.`);
}

main().catch((error) => {
  console.error(`Social ledger backfill failed: ${formatErrorForLog(error)}`);
  process.exit(1);
});
