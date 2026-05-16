import { executeD1Query } from "../src/lib/d1-client";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

interface SocialPostRow {
  platform: string;
  content_key: string;
  external_id: string | null;
  posted_at: string;
}

interface AutomationRunRow {
  id: string;
  workflow: string;
  slot: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
}

interface QuotaSnapshotRow {
  source: string;
  period: string;
  count: number;
  recorded_at: string;
}

interface MediaStagingCountRow {
  status: string;
  count: number;
}

async function main(): Promise<void> {
  const socialPosts = await executeD1Query<SocialPostRow>(
    `
    SELECT platform, content_key, external_id, posted_at
    FROM social_posts
    ORDER BY posted_at DESC
    LIMIT 10
    `,
    [],
    { required: true },
  );

  const automationRuns = await executeD1Query<AutomationRunRow>(
    `
    SELECT id, workflow, slot, status, started_at, finished_at
    FROM automation_runs
    ORDER BY started_at DESC
    LIMIT 10
    `,
    [],
    { required: true },
  );

  const quotaSnapshots = await executeD1Query<QuotaSnapshotRow>(
    `
    SELECT source, period, count, recorded_at
    FROM quota_snapshots
    ORDER BY recorded_at DESC, source ASC
    LIMIT 20
    `,
    [],
    { required: true },
  );

  const mediaStaging = await executeD1Query<MediaStagingCountRow>(
    `
    SELECT status, COUNT(*) AS count
    FROM media_staging
    GROUP BY status
    ORDER BY status ASC
    `,
    [],
    { required: true },
  );

  console.log(JSON.stringify({
    automationRuns: automationRuns[0]?.results || [],
    mediaStaging: mediaStaging[0]?.results || [],
    quotaSnapshots: quotaSnapshots[0]?.results || [],
    socialPosts: socialPosts[0]?.results || [],
  }, null, 2));
}

main().catch((error) => {
  console.error(`Ops ledger report failed: ${formatErrorForLog(error)}`);
  process.exit(1);
});
