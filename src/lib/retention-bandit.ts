import * as fs from "fs";
import * as path from "path";

export interface ArmPerformance {
  armKey: string;
  impressions: number;
  totalViews: number;
  avgCompletionPercentage: number; // 0..100
  totalRewardScore: number;
  lastUpdated?: string;
}

export interface BanditArmSelection<T> {
  selected: T;
  score: number;
  strategy: "exploit" | "explore" | "deterministic-fallback";
}

export interface BanditSelectOptions {
  seed?: string;
  stats?: Map<string, ArmPerformance>;
  explorationConstant?: number;
  statsFilePath?: string;
}

const DEFAULT_EXPLORATION_CONSTANT = 0.65;

/**
 * Compute composite reward: 70% retention completion + 30% view scale
 */
export function calculateArmReward(views: number, avgCompletionPercentage: number): number {
  const safeCompletion = Math.max(0, Math.min(100, avgCompletionPercentage));
  const safeViews = Math.max(0, views);

  const retentionWeight = 0.7;
  const viewWeight = 0.3;

  const retentionScore = safeCompletion / 100;
  // Normalized views capped at 1000 views for local short-form scaling
  const viewScore = Math.min(1, safeViews / 1000);

  return Number((retentionScore * retentionWeight + viewScore * viewWeight).toFixed(4));
}

/**
 * Simple stable 32-bit hash for deterministic fallbacks
 */
function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Load bandit arm statistics from local JSON storage
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
 * Save updated bandit arm statistics to local JSON storage
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

/**
 * Record feedback for an arm (impressions, views, retention completion)
 */
export function recordArmFeedback(
  stats: Map<string, ArmPerformance>,
  armKey: string,
  views: number,
  avgCompletionPercentage: number,
): void {
  const current = stats.get(armKey) || {
    armKey,
    impressions: 0,
    totalViews: 0,
    avgCompletionPercentage: 0,
    totalRewardScore: 0,
  };

  const newReward = calculateArmReward(views, avgCompletionPercentage);
  const nextImpressions = current.impressions + 1;
  const nextTotalViews = current.totalViews + views;
  const nextAvgCompletion = Number(
    ((current.avgCompletionPercentage * current.impressions + avgCompletionPercentage) / nextImpressions).toFixed(2),
  );
  const nextTotalReward = Number((current.totalRewardScore + newReward).toFixed(4));

  stats.set(armKey, {
    armKey,
    impressions: nextImpressions,
    totalViews: nextTotalViews,
    avgCompletionPercentage: nextAvgCompletion,
    totalRewardScore: nextTotalReward,
    lastUpdated: new Date().toISOString(),
  });
}

/**
 * Upper Confidence Bound (UCB-1) arm selection with deterministic offline fallback
 */
export function selectBanditArm<T extends { key: string }>(
  candidates: readonly T[],
  options: BanditSelectOptions = {},
): BanditArmSelection<T> {
  if (candidates.length === 0) {
    throw new Error("selectBanditArm: candidates list cannot be empty");
  }
  if (candidates.length === 1) {
    return { selected: candidates[0], score: 1.0, strategy: "deterministic-fallback" };
  }

  const statsMap = options.stats || loadBanditArmStats(options.statsFilePath);
  const explorationC = options.explorationConstant ?? DEFAULT_EXPLORATION_CONSTANT;

  // Calculate total impressions across all active candidates
  let totalObservations = 0;
  for (const c of candidates) {
    const stat = statsMap.get(c.key);
    if (stat) totalObservations += stat.impressions;
  }

  // If no stats exist at all (cold start / offline), fall back to deterministic hash rotation
  if (totalObservations === 0) {
    const seed = options.seed || "tokenradar-bandit-coldstart";
    const index = stableHash(seed) % candidates.length;
    return {
      selected: candidates[index],
      score: 0.5,
      strategy: "deterministic-fallback",
    };
  }

  // UCB-1 Score calculation for each candidate
  let bestCandidate = candidates[0];
  let bestScore = -Infinity;
  let strategy: "exploit" | "explore" = "exploit";

  for (const c of candidates) {
    const stat = statsMap.get(c.key);
    let ucbScore = 0;

    if (!stat || stat.impressions === 0) {
      // Unexplored arm gets high priority exploration bonus
      const unvisitedBonus = 1.0 + Math.sqrt(Math.log(totalObservations + 1));
      ucbScore = unvisitedBonus;
      if (ucbScore > bestScore) {
        bestScore = ucbScore;
        bestCandidate = c;
        strategy = "explore";
      }
    } else {
      const meanReward = stat.totalRewardScore / stat.impressions;
      const explorationBonus = explorationC * Math.sqrt(Math.log(totalObservations) / stat.impressions);
      ucbScore = meanReward + explorationBonus;

      if (ucbScore > bestScore) {
        bestScore = ucbScore;
        bestCandidate = c;
        strategy = "exploit";
      }
    }
  }

  return {
    selected: bestCandidate,
    score: Number(bestScore.toFixed(4)),
    strategy,
  };
}

