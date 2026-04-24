import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { MONTHLY_LIMIT, getApiQuota, sendTelegramAlert } from "../src/lib/reporter";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const LOGS_DIR = path.resolve(__dirname, "../data/logs");
const ACTIVITIES_DIR = path.join(LOGS_DIR, "activities");
const ERRORS_DIR = path.join(LOGS_DIR, "errors");
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";

interface ActivityRecord {
  type: string;
  tokenId?: string;
  tokenName?: string;
  platform?: string;
  reason?: string;
  tokenCount?: number;
  tokensProcessed?: number;
  cost?: number;
  articles?: number;
}

interface ErrorRecord {
  source: string;
  message: string;
  isFatal: boolean;
}

function safeReadJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function main() {
  const activityFiles = fs.existsSync(ACTIVITIES_DIR)
    ? fs.readdirSync(ACTIVITIES_DIR).filter((file) => file.endsWith(".json"))
    : [];
  const errorFiles = fs.existsSync(ERRORS_DIR)
    ? fs.readdirSync(ERRORS_DIR).filter((file) => file.endsWith(".json"))
    : [];

  const socialPosts: Array<{ name: string; platform: string; reason: string }> = [];
  const publishedContent: Array<{ name: string; id: string; count: number }> = [];
  let totalDataRefreshed = 0;
  let metricsTokensCount = 0;
  let tgeCount = 0;
  const errors: Record<string, number> = {};
  let totalCost = 0;

  for (const file of activityFiles) {
    const data = safeReadJson<ActivityRecord>(path.join(ACTIVITIES_DIR, file));
    if (!data) {
      continue;
    }

    if (data.type === "social-post") {
      socialPosts.push({
        name: data.tokenName || data.tokenId || "Unknown",
        platform: data.platform || "all",
        reason: data.reason || "spotlight",
      });
    } else if (data.type === "publish-from-queue") {
      publishedContent.push({
        name: data.tokenName || data.tokenId || "Unknown",
        id: data.tokenId || "",
        count: data.articles || 0,
      });
    } else if (data.type === "data-refresh") {
      totalDataRefreshed += data.tokenCount || 0;
    } else if (data.type === "metrics-calc") {
      metricsTokensCount = Math.max(metricsTokensCount, data.tokensProcessed || 0);
    } else if (data.type === "generate") {
      totalCost += data.cost || 0;
    } else if (data.type === "tge-discovery") {
      tgeCount += data.tokenCount || 0;
    }
  }

  for (const file of errorFiles) {
    const data = safeReadJson<ErrorRecord>(path.join(ERRORS_DIR, file));
    if (!data) {
      continue;
    }

    errors[data.source] = (errors[data.source] || 0) + 1;
  }

  const quota = getApiQuota();
  const usagePercent = ((quota.count / MONTHLY_LIMIT) * 100).toFixed(1);
  const quotaStatus =
    quota.count > MONTHLY_LIMIT * 0.9
      ? "CRITICAL"
      : quota.count > MONTHLY_LIMIT * 0.7
        ? "HIGH"
        : "HEALTHY";

  let message = `*Daily System Pulse*\n_Status: ${quotaStatus}_\n\n`;

  if (publishedContent.length > 0) {
    message += `*Recently Published*\n`;
    for (const item of publishedContent) {
      message += `- [${item.name}](${siteUrl}/${item.id}) (${item.count} articles)\n`;
    }
    message += `\n`;
  }

  if (socialPosts.length > 0) {
    message += `*Social Activity*\n`;
    for (const post of socialPosts) {
      message += `- ${post.platform.toUpperCase()}: *${post.name}* (${post.reason})\n`;
    }
    message += `\n`;
  }

  message += `*Data Health*\n`;
  message += `- Refreshed: ${totalDataRefreshed} token updates\n`;
  message += `- Analyzed: ${metricsTokensCount} proprietary scores\n`;
  if (tgeCount > 0) {
    message += `- TGEs tracked: ${tgeCount}\n`;
  }
  message += `\n`;

  message += `*API Quota Tracking*\n`;
  message += `- Used: \`${quota.count}\` / ${MONTHLY_LIMIT} requests\n`;
  message += `- Monthly usage: \`${usagePercent}%\`\n`;
  if (totalCost > 0) {
    message += `- Estimated AI cost: \`$${totalCost.toFixed(4)}\`\n`;
  }
  message += `\n`;

  if (Object.keys(errors).length > 0) {
    message += `*System Errors Detected*\n`;
    for (const [source, count] of Object.entries(errors)) {
      message += `- ${source}: ${count} error(s)\n`;
    }
    message += `\n`;
  }

  if (activityFiles.length === 0 && errorFiles.length === 0) {
    message += `_No major activities logged today._\n`;
  }

  const delivered = await sendTelegramAlert(message);
  if (!delivered) {
    console.error("System pulse was not delivered. Preserving logs for the next run.");
    process.exit(1);
  }

  console.log("Successfully dispatched system pulse.");

  activityFiles.forEach((file) => fs.unlinkSync(path.join(ACTIVITIES_DIR, file)));
  errorFiles.forEach((file) => fs.unlinkSync(path.join(ERRORS_DIR, file)));
  console.log(`Cleaned up ${activityFiles.length + errorFiles.length} logs.`);
}

main().catch((error) => {
  console.error("Failed to send system pulse:", error);
  process.exit(1);
});
