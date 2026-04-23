import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { sendTelegramAlert, getApiQuota, MONTHLY_LIMIT } from "../src/lib/reporter";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const LOGS_DIR = path.resolve(__dirname, "../data/logs");
const ACTIVITIES_DIR = path.join(LOGS_DIR, "activities");
const ERRORS_DIR = path.join(LOGS_DIR, "errors");

interface ActivityRecord {
  type: string;
  tokenId?: string;
  tokenName?: string;
  platform?: string;
  reason?: string;
  tokenCount?: number;
  tokensProcessed?: number;
  cost?: number;
  wordCount?: number;
  articles?: number;
}

interface ErrorRecord {
  source: string;
  message: string;
  isFatal: boolean;
}

function safeReadJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

async function main() {
  const activityFiles = fs.existsSync(ACTIVITIES_DIR) ? fs.readdirSync(ACTIVITIES_DIR).filter(f => f.endsWith(".json")) : [];
  const errorFiles = fs.existsSync(ERRORS_DIR) ? fs.readdirSync(ERRORS_DIR).filter(f => f.endsWith(".json")) : [];

  // Collectors
  const socialPosts: Array<{ name: string; platform: string; reason: string }> = [];
  const publishedContent: Array<{ name: string; id: string; count: number }> = [];
  let totalDataRefreshed = 0;
  let metricsTokensCount = 0;
  let tgeCount = 0;
  const errors: Record<string, number> = {};
  let totalCost = 0;

  // Process Activities
  for (const file of activityFiles) {
    const data: ActivityRecord = safeReadJson(path.join(ACTIVITIES_DIR, file));
    if (!data) continue;

    if (data.type === "social-post") {
      socialPosts.push({ 
        name: data.tokenName || data.tokenId || "Unknown", 
        platform: data.platform || "all", 
        reason: data.reason || "spotlight" 
      });
    } else if (data.type === "publish-from-queue") {
      publishedContent.push({
        name: data.tokenName || data.tokenId || "Unknown",
        id: data.tokenId || "",
        count: data.articles || 0
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

  // Process Errors
  for (const file of errorFiles) {
    const data: ErrorRecord = safeReadJson(path.join(ERRORS_DIR, file));
    if (!data) continue;
    errors[data.source] = (errors[data.source] || 0) + 1;
  }

  // API Quota Tracking
  const quota = getApiQuota();
  const usagePercent = ((quota.count / MONTHLY_LIMIT) * 100).toFixed(1);
  const quotaStatus = quota.count > MONTHLY_LIMIT * 0.9 ? "🔴 CRITICAL" : quota.count > MONTHLY_LIMIT * 0.7 ? "🟡 HIGH" : "🟢 HEALTHY";

  // Build Message
  let message = `🚀 *Daily System Pulse*\n`;
  message += `_Status: ${quotaStatus}_\n\n`;

  // 1. Published Content
  if (publishedContent.length > 0) {
    message += `*📝 Recently Published*\n`;
    for (const item of publishedContent) {
      const link = `https://tokenradar.co/${item.id}`;
      message += `• [${item.name}](${link}) (${item.count} articles)\n`;
    }
    message += `\n`;
  }

  // 2. Social Activity
  if (socialPosts.length > 0) {
    message += `*🤖 Social Activity*\n`;
    for (const post of socialPosts) {
      const pIcon = post.platform === "x" ? "𝕏" : post.platform === "telegram" ? "🔹" : "📡";
      message += `• ${pIcon} *${post.name}* (${post.reason})\n`;
    }
    message += `\n`;
  }

  // 3. Data Health
  message += `*📊 Data Health*\n`;
  message += `• Refreshed: ${totalDataRefreshed} token updates\n`;
  message += `• Analyzed: ${metricsTokensCount} propriety scores\n`;
  if (tgeCount > 0) message += `• TGEs: ${tgeCount} launches tracked\n`;
  message += `\n`;

  // 4. API Quota
  message += `*📡 API Quota Tracking*\n`;
  message += `• Used: \`${quota.count}\` / ${MONTHLY_LIMIT} requests\n`;
  message += `• Monthly Usage: \`${usagePercent}%\`\n`;
  if (totalCost > 0) message += `• Est. AI Cost: \`$${totalCost.toFixed(4)}\`\n`;
  message += `\n`;

  // 5. Errors
  if (Object.keys(errors).length > 0) {
    message += `*⚠️ System Errors Detected*\n`;
    for (const [source, count] of Object.entries(errors)) {
      message += `• ${source}: ${count} error(s)\n`;
    }
    message += `\n`;
  }

  if (activityFiles.length === 0 && errorFiles.length === 0) {
    message += `_No major activities logged today._\n`;
  }

  // Dispatch
  try {
    await sendTelegramAlert(message);
    console.log("✅ Successfully dispatched system pulse.");

    // Cleanup
    activityFiles.forEach(f => fs.unlinkSync(path.join(ACTIVITIES_DIR, f)));
    errorFiles.forEach(f => fs.unlinkSync(path.join(ERRORS_DIR, f)));
    console.log(`🧹 Cleaned up ${activityFiles.length + errorFiles.length} logs.`);
  } catch (error) {
    console.error("❌ Failed to send alert:", error);
    process.exit(1);
  }
}

main();
