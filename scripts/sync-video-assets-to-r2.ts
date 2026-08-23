import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { uploadBuffer, hasR2Credentials } from "../src/lib/r2-client";
import {
  buildR2VideoAssetKey,
  validateVideoAssetManifestForPublish,
} from "../src/lib/video-asset-r2";
import {
  type VideoAssetLayer,
} from "../src/lib/video-assets";
import { loadEnv } from "../src/lib/utils";

loadEnv();

const VIDEO_ASSET_ROOT = path.resolve(process.cwd(), "public", "video-assets");
const MANIFEST_PATH = path.join(VIDEO_ASSET_ROOT, "broll", "manifest.json");

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function getLocalAssetPath(asset: VideoAssetLayer): string {
  return path.join(VIDEO_ASSET_ROOT, asset.src.replace(/\//g, path.sep));
}

function contentTypeFor(src: string): string {
  if (src.endsWith(".mp4")) return "video/mp4";
  if (src.endsWith(".webm")) return "video/webm";
  if (src.endsWith(".jpg") || src.endsWith(".jpeg")) return "image/jpeg";
  if (src.endsWith(".png")) return "image/png";
  if (src.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function main() {
  if (!hasR2Credentials()) {
    throw new Error("Missing R2 credentials; cannot publish persistent video assets.");
  }
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing local b-roll manifest: ${MANIFEST_PATH}`);
  }

  const rawManifest: unknown = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  const validation = validateVideoAssetManifestForPublish(rawManifest);
  if (!validation.valid) {
    throw new Error(`Video asset manifest is not publishable:\n${validation.errors.join("\n")}`);
  }
  const manifest = validation.normalizedManifest;

  for (const asset of manifest.assets) {
    const localPath = getLocalAssetPath(asset);
    if (!fs.existsSync(localPath)) {
      throw new Error(`${asset.id}: local file does not exist at ${localPath}`);
    }
    const actualHash = sha256File(localPath);
    if (asset.sha256 && actualHash !== asset.sha256) {
      throw new Error(`${asset.id}: checksum mismatch. manifest=${asset.sha256} actual=${actualHash}`);
    }

    const key = buildR2VideoAssetKey(asset.src);
    await uploadBuffer(fs.readFileSync(localPath), key, contentTypeFor(asset.src));
  }

  const manifestBody = Buffer.from(JSON.stringify({
    ...manifest,
    updatedAt: new Date().toISOString(),
  }, null, 2));
  const versionKey = `video-assets/broll/manifests/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await uploadBuffer(manifestBody, versionKey, "application/json");
  await uploadBuffer(manifestBody, "video-assets/broll/manifest.json", "application/json");
  console.log(`Published ${manifest.assets.length} b-roll asset(s) and manifest to R2.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
