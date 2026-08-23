import {
  normalizeVideoAssetManifest,
  type VideoAssetLayer,
  type VideoAssetManifest,
} from "./video-assets";
import { buildR2VideoAssetKey } from "./video-asset-r2";

export type VideoAssetPruneReason = "missing-local-file" | "checksum-mismatch" | "storage-budget";
export type VideoAssetBudgetState = "within-target" | "over-target";

export const VIDEO_ASSET_HYDRATION_GUARD_VERSION = 1;
export const VIDEO_ASSET_HYDRATION_GUARD_RELATIVE_PATH = "data/cache/video-assets-r2-hydration.json";

export interface VideoAssetHydrationGuard {
  version: typeof VIDEO_ASSET_HYDRATION_GUARD_VERSION;
  mode: "full";
  runId: string;
  hydratedAt: string;
  manifestSha256: string;
  assetCount: number;
}

export interface VideoAssetHydrationGuardValidationOptions {
  expectedRunId: string;
  maxAgeMs: number;
  nowMs?: number;
}

export interface VideoAssetSafetyDecision {
  safe: boolean;
  reason?: string;
}

export interface R2VideoAssetDeletionSafetyOptions {
  candidateCount: number;
  totalMediaCount: number;
  maxDeleteCount: number;
  maxDeleteRatio: number;
}

export interface LocalVideoAssetState {
  exists: boolean;
  sha256?: string;
  fileSizeBytes?: number;
}

export interface VideoAssetPruneEntry {
  asset: VideoAssetLayer;
  reason: VideoAssetPruneReason;
}

export interface BuildVideoAssetPrunePlanOptions {
  manifest: VideoAssetManifest | undefined | null;
  targetBytes: number;
  minAssets?: number;
  localAssets?: Record<string, LocalVideoAssetState | undefined>;
}

export interface VideoAssetPrunePlan {
  retainedManifest: VideoAssetManifest;
  prunedAssets: VideoAssetPruneEntry[];
  bytesBefore: number;
  bytesAfter: number;
  budgetState: VideoAssetBudgetState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateVideoAssetHydrationGuard(
  value: unknown,
  options: VideoAssetHydrationGuardValidationOptions,
): VideoAssetSafetyDecision {
  if (!options.expectedRunId.trim()) {
    return { safe: false, reason: "the expected hydration run id is empty" };
  }
  if (!Number.isFinite(options.maxAgeMs) || options.maxAgeMs <= 0) {
    return { safe: false, reason: "the hydration guard maximum age is invalid" };
  }
  if (!isRecord(value)) {
    return { safe: false, reason: "the hydration guard is not an object" };
  }
  if (value.version !== VIDEO_ASSET_HYDRATION_GUARD_VERSION || value.mode !== "full") {
    return { safe: false, reason: "the hydration guard version or mode is invalid" };
  }
  if (value.runId !== options.expectedRunId) {
    return { safe: false, reason: "the hydration guard belongs to a different run" };
  }
  if (typeof value.manifestSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.manifestSha256)) {
    return { safe: false, reason: "the hydration guard manifest checksum is invalid" };
  }
  if (!Number.isInteger(value.assetCount) || (value.assetCount as number) < 0) {
    return { safe: false, reason: "the hydration guard asset count is invalid" };
  }

  const hydratedAtMs = typeof value.hydratedAt === "string" ? Date.parse(value.hydratedAt) : Number.NaN;
  if (!Number.isFinite(hydratedAtMs)) {
    return { safe: false, reason: "the hydration guard timestamp is invalid" };
  }

  const ageMs = (options.nowMs ?? Date.now()) - hydratedAtMs;
  if (ageMs < 0) {
    return { safe: false, reason: "the hydration guard timestamp is in the future" };
  }
  if (ageMs > options.maxAgeMs) {
    return { safe: false, reason: "the hydration guard is stale" };
  }

  return { safe: true };
}

export function assessR2VideoAssetDeletionSafety(
  options: R2VideoAssetDeletionSafetyOptions,
): VideoAssetSafetyDecision {
  const { candidateCount, totalMediaCount, maxDeleteCount, maxDeleteRatio } = options;
  if (!Number.isInteger(candidateCount) || candidateCount < 0) {
    return { safe: false, reason: "the R2 deletion candidate count is invalid" };
  }
  if (!Number.isInteger(totalMediaCount) || totalMediaCount < candidateCount) {
    return { safe: false, reason: "the total R2 media count is invalid" };
  }
  if (!Number.isInteger(maxDeleteCount) || maxDeleteCount < 0) {
    return { safe: false, reason: "the R2 deletion count limit is invalid" };
  }
  if (!Number.isFinite(maxDeleteRatio) || maxDeleteRatio < 0 || maxDeleteRatio > 1) {
    return { safe: false, reason: "the R2 deletion ratio limit is invalid" };
  }
  if (candidateCount > maxDeleteCount) {
    return {
      safe: false,
      reason: `${candidateCount} candidates exceed the deletion limit of ${maxDeleteCount}`,
    };
  }
  if (candidateCount > 0 && candidateCount / totalMediaCount > maxDeleteRatio) {
    return {
      safe: false,
      reason: `${candidateCount}/${totalMediaCount} candidates exceed the deletion ratio limit of ${maxDeleteRatio}`,
    };
  }

  return { safe: true };
}

function assetSize(asset: VideoAssetLayer, localState?: LocalVideoAssetState): number {
  return localState?.fileSizeBytes || asset.fileSizeBytes || 0;
}

function assetTime(asset: VideoAssetLayer): number {
  const value = asset.downloadedAt ? Date.parse(asset.downloadedAt) : 0;
  return Number.isFinite(value) ? value : 0;
}

function isGeneratedAsset(asset: VideoAssetLayer): boolean {
  const tags = new Set(asset.tags || []);
  return asset.provider === "generated" || tags.has("generated") || tags.has("blender");
}

function comparePruneCandidates(left: VideoAssetLayer, right: VideoAssetLayer): number {
  const leftGenerated = isGeneratedAsset(left) ? 1 : 0;
  const rightGenerated = isGeneratedAsset(right) ? 1 : 0;
  if (leftGenerated !== rightGenerated) return leftGenerated - rightGenerated;

  const leftTime = assetTime(left);
  const rightTime = assetTime(right);
  if (leftTime !== rightTime) return leftTime - rightTime;

  const rightSize = right.fileSizeBytes || 0;
  const leftSize = left.fileSizeBytes || 0;
  if (leftSize !== rightSize) return rightSize - leftSize;

  return left.id.localeCompare(right.id);
}

function localPruneReason(asset: VideoAssetLayer, localState?: LocalVideoAssetState): VideoAssetPruneReason | null {
  if (asset.source !== "local" || !localState) return null;
  if (!localState.exists) return "missing-local-file";
  if (asset.sha256 && localState.sha256 && asset.sha256 !== localState.sha256) return "checksum-mismatch";
  return null;
}

export function buildVideoAssetPrunePlan(options: BuildVideoAssetPrunePlanOptions): VideoAssetPrunePlan {
  const manifest = normalizeVideoAssetManifest(options.manifest);
  const minAssets = Math.max(0, Math.floor(options.minAssets ?? 0));
  const localAssets = options.localAssets || {};
  const targetBytes = Math.max(0, Math.floor(options.targetBytes));
  const prunedAssets: VideoAssetPruneEntry[] = [];

  const bytesBefore = manifest.assets.reduce(
    (total, asset) => total + assetSize(asset, localAssets[asset.id]),
    0,
  );

  const retainedAfterLocalChecks: VideoAssetLayer[] = [];
  for (const asset of manifest.assets) {
    const reason = localPruneReason(asset, localAssets[asset.id]);
    if (reason) {
      prunedAssets.push({ asset, reason });
    } else {
      retainedAfterLocalChecks.push(asset);
    }
  }

  const retainedIds = new Set(retainedAfterLocalChecks.map((asset) => asset.id));
  let bytesAfter = retainedAfterLocalChecks.reduce(
    (total, asset) => total + assetSize(asset, localAssets[asset.id]),
    0,
  );

  const candidates = [...retainedAfterLocalChecks].sort(comparePruneCandidates);
  for (const asset of candidates) {
    if (bytesAfter <= targetBytes || retainedIds.size <= minAssets) break;

    retainedIds.delete(asset.id);
    bytesAfter -= assetSize(asset, localAssets[asset.id]);
    prunedAssets.push({ asset, reason: "storage-budget" });
  }

  const retainedAssets = manifest.assets.filter((asset) => retainedIds.has(asset.id));

  return {
    retainedManifest: {
      updatedAt: manifest.updatedAt,
      assets: retainedAssets,
    },
    prunedAssets,
    bytesBefore,
    bytesAfter,
    budgetState: bytesAfter <= targetBytes ? "within-target" : "over-target",
  };
}

function isPrunableR2BrollMediaKey(key: string): boolean {
  if (!key.startsWith("video-assets/broll/")) return false;
  if (key === "video-assets/broll/manifest.json") return false;
  if (key.startsWith("video-assets/broll/manifests/")) return false;
  return /\.(mp4|webm|mov|jpg|jpeg|png|webp)$/i.test(key);
}

export function getPrunableR2BrollMediaKeys(objectKeys: string[]): string[] {
  return objectKeys.filter(isPrunableR2BrollMediaKey);
}

export function buildUnreferencedR2VideoAssetKeys(
  manifest: VideoAssetManifest | undefined | null,
  objectKeys: string[],
): string[] {
  const referencedKeys = new Set(
    normalizeVideoAssetManifest(manifest).assets
      .map((asset) => {
        try {
          return buildR2VideoAssetKey(asset.src);
        } catch {
          return undefined;
        }
      })
      .filter((key): key is string => Boolean(key)),
  );

  return getPrunableR2BrollMediaKeys(objectKeys).filter((key) => !referencedKeys.has(key));
}
