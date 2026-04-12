import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { sendTelegramAlert } from "../src/lib/reporter";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const LOGS_DIR = path.resolve(__dirname, "../data/logs");
const ACTIVITIES_DIR = path.join(LOGS_DIR, "activities");
const ERRORS_DIR = path.join(LOGS_DIR, "errors");

interface ActivityRecord {
  timestamp: string;
  type: string;
  tokenId?: string;
  tokenName?: string;
  articleType?: string;
  isTge?: boolean;
  wordCount?: number;
  cost?: number;
  fixesCount?: number;
  warnings?: string[];
  issues?: string[];
}

interface ErrorRecord {
  timestamp: string;
  source: string;
  message: string;
  isFatal: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  if (activityFiles.length === 0 && errorFiles.length === 0) {
    console.log("No new activities or errors to report.");
    return;
  }

  // Define collectors
  const generatedRegular = new Set<string>();
  const generatedTge = new Set<string>();
  let formatFixes = 0;
  const formattedTokens = new Set<string>();
  const qualityFixes = new Set<string>();
  const qualityFails = new Set<string>();
  const systemErrors: Record<string, number> = {};
  let totalCost = 0;
  let totalWords = 0;

  // Process Activities
  for (const file of activityFiles) {
    const filePath = path.join(ACTIVITIES_DIR, file);
    const data: ActivityRecord = safeReadJson(filePath);
    if (!data) continue;

    if (data.type === "generate") {
      if (data.isTge && data.tokenId) generatedTge.add(data.tokenId);
      else if (data.tokenId) generatedRegular.add(data.tokenId);
      totalCost += data.cost || 0;
      totalWords += data.wordCount || 0;
    } else if (data.type === "format-fix") {
      if (data.tokenId) formattedTokens.add(data.tokenId);
      formatFixes += data.fixesCount || 0;
    } else if (data.type === "quality-check-fixed") {
      if (data.tokenId) qualityFixes.add(data.tokenId);
    } else if (data.type === "quality-check-failed") {
      if (data.tokenId) qualityFails.add(data.tokenId);
    }
  }

  // Process Errors
  for (const file of errorFiles) {
    const filePath = path.join(ERRORS_DIR, file);
    const data: ErrorRecord = safeReadJson(filePath);
    if (!data) continue;

    const source = data.source || "unknown";
    systemErrors[source] = (systemErrors[source] || 0) + 1;
  }

  // Format message
  let message = `🚀 *Daily System Report*\n\n`;

  if (generatedRegular.size > 0 || generatedTge.size > 0) {
    message += `*📝 Content Generation*\n`;
    message += `• Generated: ${generatedRegular.size + generatedTge.size} articles\n`;
    message += `• Words: ${totalWords.toLocaleString()}\n`;
    message += `• Est Cost: $${totalCost.toFixed(4)}\n`;
    
    if (generatedRegular.size > 0) {
      message += `• 🪙 Regular: ${Array.from(generatedRegular).join(", ")}\n`;
    }
    if (generatedTge.size > 0) {
      message += `• 🚀 Upcoming TGEs: ${Array.from(generatedTge).join(", ")}\n`;
    }
    message += `\n`;
  }

  if (qualityFixes.size > 0 || qualityFails.size > 0 || formatFixes > 0) {
    message += `*🔧 Quality & Formatting*\n`;
    if (formatFixes > 0) {
      message += `• Formatting applied: ${formatFixes} fixes across ${formattedTokens.size} tokens\n`;
    }
    if (qualityFixes.size > 0) {
      message += `• AI/Rule fixes: ${qualityFixes.size} tokens\n`;
    }
    if (qualityFails.size > 0) {
      message += `• 🛑 Quarantined (Failed): ${Array.from(qualityFails).join(", ")}\n`;
    }
    message += `\n`;
  }

  const errorCount = Object.keys(systemErrors).length;
  if (errorCount > 0) {
    message += `*⚠️ System Errors Detected*\n`;
    for (const [source, count] of Object.entries(systemErrors)) {
      message += `• ${source}: ${count} error(s)\n`;
    }
    message += `\n`;
  }

  if (message.trim() === `🚀 *Daily System Report*`) {
    message += `_No major activities logged today._`;
  }

  // Ensure within Telegram length limits
  if (message.length > 4000) {
    message = message.substring(0, 4000) + "\n\n... (Report truncated)";
  }

  try {
    await sendTelegramAlert(message);
    console.log("✅ Successfully dispatched system report.");

    // Cleanup: delete logs after successful dispatch
    for (const file of activityFiles) {
      try { fs.unlinkSync(path.join(ACTIVITIES_DIR, file)); } catch {}
    }
    for (const file of errorFiles) {
      try { fs.unlinkSync(path.join(ERRORS_DIR, file)); } catch {}
    }
    console.log(`🧹 Cleaned up ${activityFiles.length} activity logs and ${errorFiles.length} error logs.`);
  } catch (error) {
    console.error("❌ Failed to send alert:", error);
    process.exit(1);
  }
}

main();
