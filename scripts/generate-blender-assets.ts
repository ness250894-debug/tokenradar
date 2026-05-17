import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

import {
  buildBlenderAssetPlan,
  createBlenderScenePython,
  mergeBlenderAssetsIntoManifest,
  parseBlenderPresets,
} from "../src/lib/blender-assets";
import { normalizeVideoAssetManifest, type VideoAssetManifest } from "../src/lib/video-assets";
import { probeLocalVideoAsset } from "../src/lib/video-asset-metadata";
import { loadEnv } from "../src/lib/utils";

loadEnv();

const PUBLIC_VIDEO_ASSETS_DIR = path.resolve(process.cwd(), "public", "video-assets");
const BROLL_DIR = path.join(PUBLIC_VIDEO_ASSETS_DIR, "broll");
const MANIFEST_FILE = path.join(BROLL_DIR, "manifest.json");
const SCRIPT_DIR = path.resolve(process.cwd(), "tmp", "blender");

function getArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
}

function getNumberArg(args: string[], name: string, fallback: number): number {
  const value = Number(getArgValue(args, name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readManifest(): VideoAssetManifest {
  if (!fs.existsSync(MANIFEST_FILE)) return { assets: [] };
  return normalizeVideoAssetManifest(JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf-8")));
}

function buildSafeStartOffsets(seconds: number): number[] {
  return [0, 1, 2, 4, 6, 8].filter((offset) => offset < Math.max(1, seconds - 2));
}

function renderWithBlender(blenderBin: string, scriptPath: string): void {
  const result = spawnSync(blenderBin, ["--background", "--python", scriptPath], {
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(
      `Blender binary not found or could not start. Install Blender, set BLENDER_BIN, or pass --blender <path>. Tried: ${blenderBin}`,
    );
  }

  if (result.status !== 0) {
    throw new Error(`Blender render failed with exit code ${result.status}.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const optional = args.includes("--optional");
  const blenderBin = getArgValue(args, "--blender") || process.env.BLENDER_BIN || "blender";
  const presets = parseBlenderPresets(getArgValue(args, "--preset"));
  const fps = getNumberArg(args, "--fps", 30);
  const seconds = getNumberArg(args, "--seconds", 8);
  const width = getNumberArg(args, "--width", 1080);
  const height = getNumberArg(args, "--height", 1920);

  const plan = buildBlenderAssetPlan({ presets, fps, seconds, width, height });
  const planned = plan.map((item) => ({
    id: item.id,
    preset: item.preset,
    output: path.join(BROLL_DIR, item.filename),
    manifestAsset: item.manifestAsset,
  }));

  if (dryRun) {
    console.log(JSON.stringify({ blenderBin, assets: planned }, null, 2));
    return;
  }

  fs.mkdirSync(BROLL_DIR, { recursive: true });
  fs.mkdirSync(SCRIPT_DIR, { recursive: true });

  for (const item of plan) {
    const outputPath = path.join(BROLL_DIR, item.filename);
    const scriptPath = path.join(SCRIPT_DIR, `${item.id}.py`);

    if (fs.existsSync(outputPath) && !force) {
      console.log(`Skipping existing ${outputPath}. Pass --force to regenerate.`);
      continue;
    }

    fs.writeFileSync(
      scriptPath,
      createBlenderScenePython({
        preset: item.preset,
        outputPath,
        fps: item.fps,
        seconds: item.seconds,
        width: item.width,
        height: item.height,
      }),
    );

    console.log(`Rendering ${item.id} with ${blenderBin}`);
    try {
      renderWithBlender(blenderBin, scriptPath);
    } catch (error) {
      if (!optional) throw error;
      console.warn(`Skipping optional Blender render for ${item.id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const availablePlan = plan.filter((item) => fs.existsSync(path.join(BROLL_DIR, item.filename)));
  if (availablePlan.length === 0) {
    console.warn("No Blender output files are available; keeping existing manifest entries.");
    return;
  }

  const enrichedPlan = availablePlan.map((item) => {
    const outputPath = path.join(BROLL_DIR, item.filename);
    const metadata = probeLocalVideoAsset(outputPath);
    return {
      ...item,
      manifestAsset: {
        ...item.manifestAsset,
        license: "project-generated",
        downloadedAt: new Date().toISOString(),
        durationSeconds: metadata.durationSeconds,
        width: metadata.width,
        height: metadata.height,
        fileSizeBytes: metadata.fileSizeBytes,
        sha256: metadata.sha256,
        safeStartOffsets: buildSafeStartOffsets(metadata.durationSeconds),
      },
    };
  });
  const manifest = mergeBlenderAssetsIntoManifest(readManifest(), enrichedPlan);
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${plan.length} Blender asset(s) to ${MANIFEST_FILE}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
