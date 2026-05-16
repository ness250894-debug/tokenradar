import { recordAutomationRun } from "../src/lib/ops-ledger";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function runId(): string {
  const githubRunId = process.env.GITHUB_RUN_ID;
  const githubRunAttempt = process.env.GITHUB_RUN_ATTEMPT || "1";
  if (githubRunId) return `${githubRunId}-${githubRunAttempt}`;
  return `local-${Date.now()}`;
}

async function main(): Promise<void> {
  const status = argValue("--status") || process.env.AUTOMATION_STATUS || "started";
  const id = argValue("--id") || process.env.AUTOMATION_RUN_ID || runId();
  const workflow = process.env.GITHUB_WORKFLOW || process.env.TOKENRADAR_WORKFLOW || "Social Automations";
  const slot = process.env.AUTOMATION_SLOT || process.env.GITHUB_EVENT_NAME;
  const now = new Date().toISOString();

  await recordAutomationRun({
    id,
    workflow,
    slot,
    status,
    startedAt: status === "started" ? now : undefined,
    finishedAt: status === "started" ? undefined : now,
    details: {
      actor: process.env.GITHUB_ACTOR || null,
      eventName: process.env.GITHUB_EVENT_NAME || null,
      ref: process.env.GITHUB_REF || null,
      repository: process.env.GITHUB_REPOSITORY || null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
      runNumber: process.env.GITHUB_RUN_NUMBER || null,
      runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null,
      sha: process.env.GITHUB_SHA || null,
    },
  });

  console.log(`Recorded automation run ${id} with status ${status}.`);
}

main().catch((error) => {
  console.error(`Automation run recording failed: ${formatErrorForLog(error)}`);
  process.exit(1);
});
