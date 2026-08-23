import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { downloadObject, hasR2Credentials } from "../src/lib/r2-client";
import {
  buildR2VideoAssetKey,
  validateVideoAssetManifestForPublish,
} from "../src/lib/video-asset-r2";
import {
  VIDEO_ASSET_HYDRATION_GUARD_RELATIVE_PATH,
  VIDEO_ASSET_HYDRATION_GUARD_VERSION,
  type VideoAssetHydrationGuard,
} from "../src/lib/video-asset-pruning";
import {
  type VideoAssetLayer,
  type VideoAssetManifest,
} from "../src/lib/video-assets";
import { formatErrorForLog, loadEnv, writeFileAtomicSync } from "../src/lib/utils";

loadEnv();

const VIDEO_ASSET_ROOT = path.resolve(process.cwd(), "public", "video-assets");
const MANIFEST_PATH = path.join(VIDEO_ASSET_ROOT, "broll", "manifest.json");
const HYDRATION_GUARD_PATH = path.resolve(process.cwd(), VIDEO_ASSET_HYDRATION_GUARD_RELATIVE_PATH);
const LOCAL_FALLBACK_HINT = "For intentional manual local-only use, pass --allow-local-fallback.";

function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function getLocalAssetPath(asset: VideoAssetLayer): string {
  return path.join(VIDEO_ASSET_ROOT, asset.src.replace(/\//g, path.sep));
}

function localAssetMatchesManifest(asset: VideoAssetLayer): boolean {
  const localPath = getLocalAssetPath(asset);
  if (!fs.existsSync(localPath)) return false;
  if (!asset.sha256) return true;
  return sha256Buffer(fs.readFileSync(localPath)) === asset.sha256;
}

function getArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
}

async function downloadManifest(): Promise<{ manifest: VideoAssetManifest; sha256: string }> {
  const manifestBuffer = await downloadObject("video-assets/broll/manifest.json");
  const rawManifest: unknown = JSON.parse(manifestBuffer.toString("utf-8"));
  const validation = validateVideoAssetManifestForPublish(rawManifest);
  if (!validation.valid) {
    throw new Error(`R2 b-roll manifest is not publishable:\n${validation.errors.join("\n")}`);
  }
  return { manifest: validation.normalizedManifest, sha256: sha256Buffer(manifestBuffer) };
}

function persistManifest(manifest: VideoAssetManifest): void {
  writeFileAtomicSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function clearHydrationGuard(): void {
  fs.rmSync(HYDRATION_GUARD_PATH, { force: true });
}

function persistHydrationGuard(runId: string, manifestSha256: string, assetCount: number): void {
  const guard: VideoAssetHydrationGuard = {
    version: VIDEO_ASSET_HYDRATION_GUARD_VERSION,
    mode: "full",
    runId,
    hydratedAt: new Date().toISOString(),
    manifestSha256,
    assetCount,
  };
  writeFileAtomicSync(HYDRATION_GUARD_PATH, `${JSON.stringify(guard, null, 2)}\n`);
}

async function hydrateAsset(asset: VideoAssetLayer): Promise<void> {
  if (localAssetMatchesManifest(asset)) return;

  const localPath = getLocalAssetPath(asset);
  const body = await downloadObject(buildR2VideoAssetKey(asset.src));
  if (asset.sha256 && sha256Buffer(body) !== asset.sha256) {
    throw new Error(`${asset.id}: downloaded checksum mismatch`);
  }

  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  writeFileAtomicSync(localPath, body);
  console.log(`Hydrated ${asset.id} -> ${localPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const manifestOnly = args.includes("--manifest-only");
  const allowLocalFallback = args.includes("--allow-local-fallback");
  const hydrationRunId = (
    getArgValue(args, "--hydration-run-id") || process.env.VIDEO_ASSET_HYDRATION_RUN_ID || ""
  ).trim();

  clearHydrationGuard();

  if (!hasR2Credentials()) {
    const message = "Missing R2 credentials; cannot confirm the current persistent b-roll library.";
    if (allowLocalFallback) {
      console.warn(`${message} Keeping local b-roll assets because --allow-local-fallback was provided.`);
      return;
    }
    throw new Error(`${message} ${LOCAL_FALLBACK_HINT}`);
  }

  try {
    const { manifest, sha256 } = await downloadManifest();
    console.log(`Hydrated b-roll manifest with ${manifest.assets.length} asset(s).`);

    if (manifestOnly) {
      persistManifest(manifest);
      return;
    }
    for (const asset of manifest.assets) await hydrateAsset(asset);
    persistManifest(manifest);
    if (hydrationRunId) {
      persistHydrationGuard(hydrationRunId, sha256, manifest.assets.length);
      console.log(`Confirmed full R2 hydration for run ${hydrationRunId}.`);
    } else {
      console.warn(
        "Full R2 hydration completed without a run id; no deletion guard was created. " +
        "Set VIDEO_ASSET_HYDRATION_RUN_ID before any guarded R2 prune.",
      );
    }
  } catch (error) {
    clearHydrationGuard();
    if (allowLocalFallback) {
      console.warn(
        `R2 b-roll hydration failed; keeping local assets because --allow-local-fallback was provided: ${formatErrorForLog(error)}`,
      );
      return;
    }
    throw new Error(`R2 b-roll hydration failed: ${formatErrorForLog(error)} ${LOCAL_FALLBACK_HINT}`);
  }
}

main().catch((error) => {
  console.error(formatErrorForLog(error));
  process.exit(1);
});
