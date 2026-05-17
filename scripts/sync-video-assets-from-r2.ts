import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { downloadObject, hasR2Credentials } from "../src/lib/r2-client";
import { buildR2VideoAssetKey } from "../src/lib/video-asset-r2";
import {
  normalizeVideoAssetManifest,
  type VideoAssetLayer,
  type VideoAssetManifest,
} from "../src/lib/video-assets";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

const VIDEO_ASSET_ROOT = path.resolve(process.cwd(), "public", "video-assets");
const MANIFEST_PATH = path.join(VIDEO_ASSET_ROOT, "broll", "manifest.json");

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

async function downloadManifest(): Promise<VideoAssetManifest> {
  const manifestBuffer = await downloadObject("video-assets/broll/manifest.json");
  const manifest = normalizeVideoAssetManifest(JSON.parse(manifestBuffer.toString("utf-8")) as VideoAssetManifest);
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  return manifest;
}

async function hydrateAsset(asset: VideoAssetLayer): Promise<void> {
  if (localAssetMatchesManifest(asset)) return;

  const localPath = getLocalAssetPath(asset);
  const body = await downloadObject(buildR2VideoAssetKey(asset.src));
  if (asset.sha256 && sha256Buffer(body) !== asset.sha256) {
    throw new Error(`${asset.id}: downloaded checksum mismatch`);
  }

  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, body);
  console.log(`Hydrated ${asset.id} -> ${localPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const manifestOnly = args.includes("--manifest-only");

  if (!hasR2Credentials()) {
    console.warn("Missing R2 credentials; keeping local b-roll assets as fallback.");
    return;
  }

  try {
    const manifest = await downloadManifest();
    console.log(`Hydrated b-roll manifest with ${manifest.assets.length} asset(s).`);

    if (!manifestOnly) {
      for (const asset of manifest.assets) {
        await hydrateAsset(asset);
      }
    }
  } catch (error) {
    console.warn(`R2 b-roll hydration failed; keeping local assets as fallback: ${formatErrorForLog(error)}`);
  }
}

main().catch((error) => {
  console.error(formatErrorForLog(error));
  process.exit(1);
});
