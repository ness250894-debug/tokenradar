import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { deleteObjects, hasR2Credentials, listObjectKeys } from "../src/lib/r2-client";
import { validateVideoAssetManifestForPublish } from "../src/lib/video-asset-r2";
import {
  assessR2VideoAssetDeletionSafety,
  buildUnreferencedR2VideoAssetKeys,
  buildVideoAssetPrunePlan,
  getPrunableR2BrollMediaKeys,
  validateVideoAssetHydrationGuard,
  VIDEO_ASSET_HYDRATION_GUARD_RELATIVE_PATH,
  type LocalVideoAssetState,
} from "../src/lib/video-asset-pruning";
import {
  type VideoAssetLayer,
  type VideoAssetManifest,
} from "../src/lib/video-assets";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

const VIDEO_ASSET_ROOT = path.resolve(process.cwd(), "public", "video-assets");
const BROLL_DIR = path.join(VIDEO_ASSET_ROOT, "broll");
const MANIFEST_FILE = path.join(BROLL_DIR, "manifest.json");
const HYDRATION_GUARD_FILE = path.resolve(process.cwd(), VIDEO_ASSET_HYDRATION_GUARD_RELATIVE_PATH);
const BYTES_PER_GB = 1024 * 1024 * 1024;
const DEFAULT_HYDRATION_MAX_AGE_MINUTES = 90;
const DEFAULT_R2_MAX_DELETE_COUNT = 2;
const DEFAULT_R2_MAX_DELETE_RATIO = 0.25;

function getArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
}

function numberArg(args: string[], name: string, fallback: number): number {
  const value = Number(getArgValue(args, name));
  if (Number.isFinite(value) && value >= 0) return value;
  return Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
}

function readFreshHydrationGuard(args: string[]): void {
  const expectedRunId = (
    getArgValue(args, "--hydration-run-id") || process.env.VIDEO_ASSET_HYDRATION_RUN_ID || ""
  ).trim();
  const maxAgeMinutes = numberArg(
    args,
    "--hydration-max-age-minutes",
    Number(process.env.VIDEO_ASSET_HYDRATION_MAX_AGE_MINUTES || DEFAULT_HYDRATION_MAX_AGE_MINUTES),
  );

  if (!fs.existsSync(HYDRATION_GUARD_FILE)) {
    throw new Error(`Refusing R2 deletion without a hydration guard: ${HYDRATION_GUARD_FILE}`);
  }

  let guard: unknown;
  try {
    guard = JSON.parse(fs.readFileSync(HYDRATION_GUARD_FILE, "utf-8"));
  } catch (error) {
    throw new Error(`Refusing R2 deletion because the hydration guard is unreadable: ${formatErrorForLog(error)}`);
  }

  const validation = validateVideoAssetHydrationGuard(guard, {
    expectedRunId,
    maxAgeMs: maxAgeMinutes * 60 * 1000,
  });
  if (!validation.safe) {
    throw new Error(`Refusing R2 deletion because ${validation.reason}.`);
  }
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function localAssetPath(asset: VideoAssetLayer): string {
  return path.join(VIDEO_ASSET_ROOT, asset.src.replace(/\//g, path.sep));
}

function readManifest(): VideoAssetManifest {
  if (!fs.existsSync(MANIFEST_FILE)) {
    throw new Error(`Missing local b-roll manifest: ${MANIFEST_FILE}`);
  }

  const rawManifest: unknown = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8"));
  const validation = validateVideoAssetManifestForPublish(rawManifest);
  if (!validation.valid) {
    throw new Error(`Local b-roll manifest is not publishable:\n${validation.errors.join("\n")}`);
  }
  return validation.normalizedManifest;
}

function buildLocalAssetState(asset: VideoAssetLayer): LocalVideoAssetState | undefined {
  if (asset.source !== "local") return undefined;

  const filePath = localAssetPath(asset);
  if (!fs.existsSync(filePath)) return { exists: false };

  const stats = fs.statSync(filePath);
  return {
    exists: true,
    fileSizeBytes: stats.size,
    sha256: asset.sha256 ? sha256File(filePath) : undefined,
  };
}

function deleteLocalFiles(assets: VideoAssetLayer[]): number {
  let deleted = 0;
  for (const asset of assets) {
    if (asset.source !== "local") continue;
    const filePath = localAssetPath(asset);
    if (!fs.existsSync(filePath)) continue;
    fs.unlinkSync(filePath);
    deleted += 1;
  }
  return deleted;
}

async function deleteUnreferencedR2Assets(
  manifest: VideoAssetManifest,
  args: string[],
  dryRun: boolean,
  confirmed: boolean,
): Promise<number> {
  if (!hasR2Credentials()) {
    throw new Error("R2 credentials are not configured; refusing unreferenced b-roll deletion.");
  }

  if (!dryRun) {
    if (!confirmed) {
      throw new Error(
        "Refusing R2 deletion without --confirm-r2-delete. Run with --dry-run first and review the candidate list.",
      );
    }
    readFreshHydrationGuard(args);
  }

  const objectKeys = await listObjectKeys("video-assets/broll/");
  const mediaKeys = getPrunableR2BrollMediaKeys(objectKeys);
  const unreferencedKeys = buildUnreferencedR2VideoAssetKeys(manifest, objectKeys);
  if (unreferencedKeys.length === 0) {
    console.log("No unreferenced R2 b-roll media objects found.");
    if (!dryRun) fs.rmSync(HYDRATION_GUARD_FILE, { force: true });
    return 0;
  }

  const maxDeleteCount = Math.floor(numberArg(
    args,
    "--max-r2-deletes",
    Number(process.env.VIDEO_ASSET_R2_MAX_DELETE_COUNT || DEFAULT_R2_MAX_DELETE_COUNT),
  ));
  const maxDeleteRatio = numberArg(
    args,
    "--max-r2-delete-ratio",
    Number(process.env.VIDEO_ASSET_R2_MAX_DELETE_RATIO || DEFAULT_R2_MAX_DELETE_RATIO),
  );
  const safety = assessR2VideoAssetDeletionSafety({
    candidateCount: unreferencedKeys.length,
    totalMediaCount: mediaKeys.length,
    maxDeleteCount,
    maxDeleteRatio,
  });

  console.log(
    `${dryRun ? "R2 deletion preview" : "R2 deletion request"}: ` +
    `${unreferencedKeys.length}/${mediaKeys.length} unreferenced media object(s).`,
  );
  for (const key of unreferencedKeys) console.log(`  ${key}`);

  if (dryRun) {
    if (!safety.safe) console.warn(`Safety boundary would block deletion: ${safety.reason}.`);
    return 0;
  }

  if (!safety.safe) {
    throw new Error(`Refusing R2 deletion because ${safety.reason}. Run --dry-run and review before changing limits.`);
  }

  const deleted = await deleteObjects(unreferencedKeys);
  fs.rmSync(HYDRATION_GUARD_FILE, { force: true });
  return deleted;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const confirmR2Delete = args.includes("--confirm-r2-delete");
  const deleteLocal = args.includes("--delete-local");
  const deleteR2Unreferenced = args.includes("--delete-r2-unreferenced");
  const r2Only = args.includes("--r2-only");
  const targetGb = numberArg(args, "--target-gb", Number(process.env.VIDEO_ASSET_TARGET_GB || "5"));
  const minAssets = numberArg(args, "--min-assets", Number(process.env.VIDEO_ASSET_MIN_ASSETS || "8"));

  const manifest = readManifest();
  let retainedManifest = manifest;
  let localDeleted = 0;

  if (!r2Only) {
    const localAssets = Object.fromEntries(
      manifest.assets.map((asset) => [asset.id, buildLocalAssetState(asset)]),
    );
    const plan = buildVideoAssetPrunePlan({
      manifest,
      targetBytes: Math.floor(targetGb * BYTES_PER_GB),
      minAssets,
      localAssets,
    });
    retainedManifest = {
      ...plan.retainedManifest,
      updatedAt: new Date().toISOString(),
    };

    console.log(
      `B-roll prune plan: ${plan.prunedAssets.length} prune candidate(s), ` +
      `${(plan.bytesBefore / BYTES_PER_GB).toFixed(2)} GB -> ` +
      `${(plan.bytesAfter / BYTES_PER_GB).toFixed(2)} GB (${plan.budgetState}).`,
    );
    for (const entry of plan.prunedAssets) {
      console.log(`  ${entry.reason}: ${entry.asset.id} (${entry.asset.src})`);
    }

    if (plan.prunedAssets.length > 0 && !dryRun) {
      fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(retainedManifest, null, 2)}\n`);
      if (deleteLocal) {
        localDeleted = deleteLocalFiles(plan.prunedAssets.map((entry) => entry.asset));
      }
    }
  }

  const r2Deleted = deleteR2Unreferenced
    ? await deleteUnreferencedR2Assets(retainedManifest, args, dryRun, confirmR2Delete)
    : 0;

  console.log(`Pruned ${localDeleted} local file(s) and ${r2Deleted} R2 object(s).`);
}

main().catch((error) => {
  console.error(`Video asset pruning failed: ${formatErrorForLog(error)}`);
  process.exit(1);
});
