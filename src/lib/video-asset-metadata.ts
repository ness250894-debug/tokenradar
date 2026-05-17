import { execFileSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";

export interface LocalVideoAssetMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fileSizeBytes: number;
  sha256: string;
}

interface FfprobeOutput {
  streams?: Array<{
    width?: number;
    height?: number;
    duration?: string;
  }>;
  format?: {
    duration?: string;
  };
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function resolveFfprobePath(): string {
  if (process.env.FFPROBE_BIN?.trim()) return process.env.FFPROBE_BIN.trim();

  const lookupCommand = os.platform() === "win32" ? "where.exe" : "which";
  try {
    const output = execFileSync(lookupCommand, ["ffprobe"], { encoding: "utf-8" });
    const firstPath = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (firstPath) return firstPath;
  } catch {
    // Fall back to relying on PATH so CI images with a normal shell still work.
  }

  return "ffprobe";
}

export function probeLocalVideoAsset(filePath: string): LocalVideoAssetMetadata {
  const output = execFileSync(
    resolveFfprobePath(),
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,duration:format=duration",
      "-of",
      "json",
      filePath,
    ],
    { encoding: "utf-8" },
  );
  const parsed = JSON.parse(output) as FfprobeOutput;
  const stream = parsed.streams?.[0];
  const duration = Number(stream?.duration || parsed.format?.duration);
  const stats = fs.statSync(filePath);

  if (!stream?.width || !stream.height || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not probe usable video metadata for ${filePath}`);
  }

  return {
    durationSeconds: Number(duration.toFixed(3)),
    width: stream.width,
    height: stream.height,
    fileSizeBytes: stats.size,
    sha256: sha256File(filePath),
  };
}
