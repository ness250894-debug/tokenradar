import * as fs from "fs";
import * as path from "path";

import { safeReadJson } from "../../src/lib/utils";

export type SocialHistoryPlatform = "telegram" | "x" | "instagram" | "threads" | "youtube" | "tiktok";

const PLATFORM_TEXT_FIELDS: Record<SocialHistoryPlatform, string[]> = {
  telegram: ["telegramText", "caption", "text"],
  x: ["xText", "tweetText", "pollText", "text"],
  instagram: ["instagramCaption", "caption"],
  threads: ["threadsText", "caption"],
  youtube: ["youtubeTitle", "youtubeDescription", "title", "description"],
  tiktok: ["tiktokCaption", "caption"],
};

function isDateDir(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name) && !Number.isNaN(new Date(name).getTime());
}

function addStringField(target: string[], value: unknown): void {
  if (typeof value === "string" && value.trim()) {
    target.push(value.trim());
  }
}

function collectTextFields(payload: unknown, platform: SocialHistoryPlatform): string[] {
  const texts: string[] = [];
  if (!payload || typeof payload !== "object") return texts;

  const record = payload as Record<string, unknown>;
  const fields = PLATFORM_TEXT_FIELDS[platform];

  for (const field of fields) {
    addStringField(texts, record[field]);
  }

  const platformTracker = record.platforms && typeof record.platforms === "object"
    ? (record.platforms as Record<string, unknown>)[platform]
    : undefined;
  if (platformTracker && typeof platformTracker === "object") {
    const trackerRecord = platformTracker as Record<string, unknown>;
    for (const field of fields) {
      addStringField(texts, trackerRecord[field]);
    }
  }

  return texts;
}

export function getRecentPlatformTexts(
  dataDir: string,
  platform: SocialHistoryPlatform,
  days = 14,
  now: Date = new Date(),
): string[] {
  const texts: string[] = [];
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  for (const rootName of ["posted", "posted_video"]) {
    const rootDir = path.join(dataDir, rootName);
    if (!fs.existsSync(rootDir)) continue;

    for (const dateDir of fs.readdirSync(rootDir).filter(isDateDir)) {
      if (new Date(`${dateDir}T00:00:00.000Z`) < cutoff) continue;

      const fullDateDir = path.join(rootDir, dateDir);
      if (!fs.statSync(fullDateDir).isDirectory()) continue;

      for (const fileName of fs.readdirSync(fullDateDir).filter((file) => file.endsWith(".json"))) {
        const payload = safeReadJson<Record<string, unknown> | null>(
          path.join(fullDateDir, fileName),
          null,
        );
        texts.push(...collectTextFields(payload, platform));
      }
    }
  }

  return Array.from(new Set(texts));
}
