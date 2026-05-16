import { executeD1Query } from "../src/lib/d1-client";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

async function main(): Promise<void> {
  const key = `d1-smoke-${Date.now()}`;
  const postedAt = new Date().toISOString();

  await executeD1Query(
    "INSERT INTO social_posts (platform, content_key, external_id, posted_at, details_json) VALUES (?, ?, ?, ?, ?)",
    ["smoke", key, "d1-smoke", postedAt, JSON.stringify({ source: "d1-smoke" })],
    { required: true },
  );

  const selected = await executeD1Query<{ content_key: string }>(
    "SELECT content_key FROM social_posts WHERE platform = ? AND content_key = ?",
    ["smoke", key],
    { required: true },
  );

  await executeD1Query(
    "DELETE FROM social_posts WHERE platform = ? AND content_key = ?",
    ["smoke", key],
    { required: true },
  );

  const deleted = await executeD1Query<{ count: number }>(
    "SELECT COUNT(*) AS count FROM social_posts WHERE platform = ? AND content_key = ?",
    ["smoke", key],
    { required: true },
  );

  if ((selected[0]?.results || []).length !== 1 || deleted[0]?.results?.[0]?.count !== 0) {
    throw new Error("D1 smoke insert/select/delete verification failed.");
  }

  console.log("D1 smoke test passed: insert/select/delete succeeded.");
}

main().catch((error) => {
  console.error(`D1 smoke test failed: ${formatErrorForLog(error)}`);
  process.exit(1);
});
