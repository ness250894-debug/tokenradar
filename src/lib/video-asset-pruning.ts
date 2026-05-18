import {
  normalizeVideoAssetManifest,
  type VideoAssetLayer,
  type VideoAssetManifest,
} from "./video-assets";
import { buildR2VideoAssetKey } from "./video-asset-r2";

export type VideoAssetPruneReason = "missing-local-file" | "checksum-mismatch" | "storage-budget";
export type VideoAssetBudgetState = "within-target" | "over-target";

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

  return objectKeys.filter((key) => isPrunableR2BrollMediaKey(key) && !referencedKeys.has(key));
}
