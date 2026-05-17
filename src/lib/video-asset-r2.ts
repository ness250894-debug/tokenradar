import {
  normalizeVideoAssetManifest,
  type VideoAssetLayer,
  type VideoAssetManifest,
} from "./video-assets";

export interface VideoAssetManifestValidationResult {
  valid: boolean;
  errors: string[];
}

function normalizeLocalAssetSource(src: string): string {
  return src.replace(/\\/g, "/").trim();
}

function isSafeVideoAssetSource(src: string): boolean {
  const normalized = normalizeLocalAssetSource(src);
  if (!normalized) return false;
  if (normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../")) return false;
  if (normalized.includes("/../") || normalized.includes("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return false;
  return normalized.startsWith("broll/") || normalized.startsWith("video-assets/broll/");
}

export function buildR2VideoAssetKey(src: string): string {
  const normalized = normalizeLocalAssetSource(src);
  if (!isSafeVideoAssetSource(normalized)) {
    throw new Error(`Unsafe video asset source: ${src}`);
  }

  return normalized.startsWith("video-assets/broll/")
    ? normalized
    : `video-assets/${normalized}`;
}

function isStockProvider(asset: VideoAssetLayer): boolean {
  return asset.provider === "pexels" || asset.provider === "pixabay";
}

function validateAssetMetadata(asset: VideoAssetLayer, errors: string[]): void {
  if (!asset.id.trim()) errors.push("asset missing id");
  if (asset.source !== "local") errors.push(`${asset.id}: source must be local for R2 b-roll publish`);
  if (!isSafeVideoAssetSource(asset.src)) errors.push(`${asset.id}: unsafe src`);
  if (!asset.durationSeconds) errors.push(`${asset.id}: missing durationSeconds`);
  if (!asset.width) errors.push(`${asset.id}: missing width`);
  if (!asset.height) errors.push(`${asset.id}: missing height`);
  if (!asset.fileSizeBytes) errors.push(`${asset.id}: missing fileSizeBytes`);
  if (!asset.sha256) errors.push(`${asset.id}: missing sha256`);

  if (isStockProvider(asset)) {
    if (!asset.sourcePageUrl) errors.push(`${asset.id}: missing sourcePageUrl`);
    if (!asset.attribution) errors.push(`${asset.id}: missing attribution`);
  }
}

export function validateVideoAssetManifestForPublish(
  manifest: VideoAssetManifest | undefined | null,
): VideoAssetManifestValidationResult {
  const normalized = normalizeVideoAssetManifest(manifest);
  const errors: string[] = [];
  const seenIds = new Set<string>();

  if (normalized.assets.length === 0) {
    errors.push("manifest has no valid assets");
  }

  for (const asset of normalized.assets) {
    if (seenIds.has(asset.id)) {
      errors.push(`${asset.id}: duplicate asset id`);
      continue;
    }
    seenIds.add(asset.id);
    validateAssetMetadata(asset, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
