import { deleteObjects, hasR2Credentials } from "../src/lib/r2-client";
import { isOpsLedgerEnabled, listExpiredMediaStaging } from "../src/lib/ops-ledger";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

async function main(): Promise<void> {
  if (!isOpsLedgerEnabled()) {
    console.log("D1 ops ledger is not configured; skipping R2 ledger cleanup.");
    return;
  }

  if (!hasR2Credentials()) {
    console.log("R2 credentials are not configured; skipping R2 ledger cleanup.");
    return;
  }

  const rows = await listExpiredMediaStaging(500);
  if (rows.length === 0) {
    console.log("No expired R2 staging objects found in D1.");
    return;
  }

  const keys = rows.map((row) => row.object_key);
  const deleted = await deleteObjects(keys);
  console.log(`Deleted ${deleted} expired R2 staging object(s) tracked by D1.`);
}

main().catch((error) => {
  console.error(`R2 ledger cleanup failed: ${formatErrorForLog(error)}`);
  process.exit(1);
});
