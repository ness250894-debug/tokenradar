import {
  normalizeVideoAssetManifest,
  type VideoAssetLayer,
  type VideoAssetManifest,
} from "./video-assets";

export interface VideoAssetManifestValidationResult {
  valid: boolean;
  errors: string[];
  normalizedManifest: VideoAssetManifest;
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

function hasTag(asset: VideoAssetLayer, tag: string): boolean {
  return new Set(asset.tags || []).has(tag);
}

function hasCropSafeMetadata(asset: VideoAssetLayer): boolean {
  return hasTag(asset, "crop-safe") || hasTag(asset, "crop_safe");
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
    if (!asset.license) errors.push(`${asset.id}: missing license`);
    if (!asset.safeStartOffsets?.length) errors.push(`${asset.id}: missing safeStartOffsets`);
    if (asset.durationSeconds && asset.durationSeconds < 8) errors.push(`${asset.id}: duration below 8 seconds`);
    if (asset.width && asset.height && (asset.width < 720 || asset.height < 1280)) {
      errors.push(`${asset.id}: vertical stock clips must be at least 720x1280`);
    }
    if (asset.orientation === "horizontal" && !hasCropSafeMetadata(asset)) {
      errors.push(`${asset.id}: horizontal stock clips require crop-safe metadata`);
    }
    if (asset.orientation === "square" && !hasCropSafeMetadata(asset)) {
      errors.push(`${asset.id}: square stock clips require crop-safe metadata`);
    }
    if (hasTag(asset, "watermark") || hasTag(asset, "watermarked")) {
      errors.push(`${asset.id}: watermarked assets are not allowed`);
    }
    if (hasTag(asset, "blocked") || hasTag(asset, "takedown")) {
      errors.push(`${asset.id}: blocked by provider governance`);
    }
  }
}

export function validateVideoAssetManifestForPublish(
  manifest: unknown,
): VideoAssetManifestValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  let normalized: VideoAssetManifest = { assets: [] };
  const rawAssets = manifest && typeof manifest === "object" && !Array.isArray(manifest)
    ? (manifest as { assets?: unknown }).assets
    : undefined;

  if (!Array.isArray(rawAssets)) {
    errors.push("manifest assets must be an array");
  } else {
    try {
      normalized = normalizeVideoAssetManifest(manifest as VideoAssetManifest);
      if (normalized.assets.length !== rawAssets.length) {
        const invalidCount = rawAssets.length - normalized.assets.length;
        errors.push(
          `manifest contains ${invalidCount} invalid asset ${invalidCount === 1 ? "entry" : "entries"}`,
        );
      }
    } catch {
      errors.push("manifest contains an asset that could not be normalized");
    }
  }

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
    normalizedManifest: normalized,
  };
}
