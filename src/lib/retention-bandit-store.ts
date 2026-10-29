import * as fs from "fs";
import * as path from "path";
import type { ArmPerformance } from "./retention-bandit";

/**
 * Load bandit arm statistics from local JSON storage.
 */
export function loadBanditArmStats(filePath?: string): Map<string, ArmPerformance> {
  const map = new Map<string, ArmPerformance>();
  if (!filePath || !fs.existsSync(filePath)) return map;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && typeof item.armKey === "string") {
          map.set(item.armKey, {
            armKey: item.armKey,
            impressions: Number(item.impressions) || 0,
            totalViews: Number(item.totalViews) || 0,
            avgCompletionPercentage: Number(item.avgCompletionPercentage) || 0,
            totalRewardScore: Number(item.totalRewardScore) || 0,
            lastUpdated: item.lastUpdated,
          });
        }
      }
    }
  } catch {
    // Return empty map on read/parse error
  }

  return map;
}

/**
 * Save updated bandit arm statistics to local JSON storage.
 */
export function saveBanditArmStats(filePath: string, stats: Map<string, ArmPerformance>): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const array = Array.from(stats.values());
    fs.writeFileSync(filePath, JSON.stringify(array, null, 2), "utf8");
  } catch {
    // Non-fatal if local write fails
  }
}

