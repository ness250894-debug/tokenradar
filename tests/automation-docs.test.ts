import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

const WORKFLOW_DIR = path.join(process.cwd(), ".github", "workflows");
const AUTOMATION_WORKFLOWS = [
  "social-automations.yml",
  "daily-content-generation.yml",
  "daily-refresh.yml",
  "deploy.yml",
  "video-assets-refresh.yml",
  "performance.yml",
  "dependency-security.yml",
  "monthly-data-snapshot.yml",
];

function readWorkflow(name: string): string {
  return fs.readFileSync(path.join(WORKFLOW_DIR, name), "utf-8");
}

describe("automation runbook contract", () => {
  it("keeps documented workflow-level Telegram fallback alerts wired for every workflow", () => {
    expect(AUTOMATION_WORKFLOWS).toHaveLength(8);

    for (const workflowName of AUTOMATION_WORKFLOWS) {
      const workflow = readWorkflow(workflowName);

      expect(workflow, `${workflowName} is missing a fallback notification step`).toContain("Notify on Failure");
      expect(workflow, `${workflowName} should guard missing report bot token`).toContain("TELEGRAM_REPORT_BOT_TOKEN");
      expect(workflow, `${workflowName} should guard missing report chat id`).toContain("TELEGRAM_REPORT_CHAT_ID");
      expect(workflow, `${workflowName} should call Telegram Bot API`).toContain("https://api.telegram.org/bot$TELEGRAM_REPORT_BOT_TOKEN/sendMessage");
    }
  });
});
