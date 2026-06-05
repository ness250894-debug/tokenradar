import * as fs from "fs";
import * as path from "path";

import type { SocialVariantPlatform } from "../../src/lib/social-variety";
import { safeReadJson } from "../../src/lib/utils";

export type SocialHistoryPlatform = "telegram" | "x" | "instagram" | "threads" | "youtube" | "tiktok";
export type SocialVariantHistoryPlatform = SocialHistoryPlatform | SocialVariantPlatform;

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

function collectStringFieldsFromRecord(
  record: Record<string, unknown> | undefined,
  fields: string[],
): string[] {
  if (!record) return [];

  const values: string[] = [];
  for (const field of fields) {
    addStringField(values, record[field]);
  }
  return values;
}

function collectNestedPlatformRecord(
  payload: Record<string, unknown> | null,
  platform: SocialHistoryPlatform,
): Record<string, unknown> | undefined {
  const platformTracker = payload?.platforms && typeof payload.platforms === "object"
    ? (payload.platforms as Record<string, unknown>)[platform]
    : undefined;

  return platformTracker && typeof platformTracker === "object" && !Array.isArray(platformTracker)
    ? platformTracker as Record<string, unknown>
    : undefined;
}

function dateKeyDaysAgo(days: number, now: Date): string {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  startOfToday.setUTCDate(startOfToday.getUTCDate() - days);
  return startOfToday.toISOString().split("T")[0];
}

function inferVariantPlatform(
  fileName: string,
  payload: Record<string, unknown> | null,
): SocialVariantHistoryPlatform | undefined {
  if (typeof payload?.variantPlatform === "string") {
    return payload.variantPlatform as SocialVariantHistoryPlatform;
  }

  if (fileName === "daily-instagram-movers") return "instagram-carousel";
  if (fileName === "daily-threads-text") return "threads";
  if (fileName === "daily-telegram-movers" || fileName === "daily-telegram-poll") return "telegram";
  if (fileName === "interactive-daily") return "x";

  if (typeof payload?.platform === "string") {
    return payload.platform as SocialVariantHistoryPlatform;
  }

  const platformSuffix = fileName.match(/-(telegram|x|instagram|threads|youtube|tiktok)$/);
  return platformSuffix?.[1] as SocialVariantHistoryPlatform | undefined;
}

function inferVariantSurface(fileName: string, payload: Record<string, unknown> | null): string | undefined {
  if (typeof payload?.variantSurface === "string") return payload.variantSurface;
  if (typeof payload?.surface === "string") return payload.surface;

  if (fileName === "daily-instagram-movers") return "instagram-carousel";
  if (fileName === "daily-threads-text") return "threads-text";
  if (fileName === "daily-telegram-movers") return "telegram-movers";
  if (fileName === "daily-telegram-poll") return "telegram-poll";
  if (fileName === "interactive-daily") return "interactive-poll";

  return undefined;
}

function inferNestedVariantSurface(payload: Record<string, unknown> | undefined): string | undefined {
  if (typeof payload?.variantSurface === "string") return payload.variantSurface;
  if (typeof payload?.surface === "string") return payload.surface;
  if (typeof payload?.formatKey === "string") return "video";
  if (typeof payload?.visualRecipeKey === "string") return "video";
  if (typeof payload?.deliveryMode === "string") return "video";
  return undefined;
}

function collectVariantKeys(payload: Record<string, unknown> | null): string[] {
  if (!payload) return [];

  const keys: string[] = [];
  for (const field of ["variantKey", "contentVariantKey", "socialVariantKey", "variant", "themeKey", "pollType"]) {
    const value = payload[field];
    if (typeof value === "string" && value.trim()) keys.push(value.trim());
  }

  return keys;
}

function collectArchetypeKeys(payload: Record<string, unknown> | null | undefined): string[] {
  return collectStringFieldsFromRecord(payload || undefined, ["archetypeKey", "contentArchetypeKey"]);
}

function collectHookFamilies(payload: Record<string, unknown> | null | undefined): string[] {
  return collectStringFieldsFromRecord(payload || undefined, ["hookFamily"]);
}

function collectCtaFamilies(payload: Record<string, unknown> | null | undefined): string[] {
  return collectStringFieldsFromRecord(payload || undefined, ["ctaFamily"]);
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

export function getRecentSocialVariantKeys(
  dataDir: string,
  platform: SocialVariantHistoryPlatform,
  days: number,
  now: Date = new Date(),
  surface?: string,
): Set<string> {
  const keys = new Set<string>();
  const rootDir = path.join(dataDir, "posted");
  if (!fs.existsSync(rootDir)) return keys;

  const cutoffKey = dateKeyDaysAgo(days, now);

  for (const dateDir of fs.readdirSync(rootDir).filter(isDateDir)) {
    if (dateDir < cutoffKey) continue;

    const fullDateDir = path.join(rootDir, dateDir);
    if (!fs.statSync(fullDateDir).isDirectory()) continue;

    for (const fileNameWithExt of fs.readdirSync(fullDateDir).filter((file) => file.endsWith(".json"))) {
      const fileName = path.basename(fileNameWithExt, ".json");
      const payload = safeReadJson<Record<string, unknown> | null>(
        path.join(fullDateDir, fileNameWithExt),
        null,
      );
      const trackerPlatform = inferVariantPlatform(fileName, payload);
      if (trackerPlatform !== platform) continue;

      const trackerSurface = inferVariantSurface(fileName, payload);
      if (surface && trackerSurface !== surface) continue;

      for (const key of collectVariantKeys(payload)) {
        keys.add(key);
      }
    }
  }

  return keys;
}

export function getRecentSocialArchetypeKeys(
  dataDir: string,
  platform: SocialVariantHistoryPlatform,
  days: number,
  now: Date = new Date(),
  surface?: string,
): Set<string> {
  const keys = new Set<string>();
  const cutoffKey = dateKeyDaysAgo(days, now);

  for (const rootName of ["posted", "posted_video"]) {
    const rootDir = path.join(dataDir, rootName);
    if (!fs.existsSync(rootDir)) continue;

    for (const dateDir of fs.readdirSync(rootDir).filter(isDateDir)) {
      if (dateDir < cutoffKey) continue;

      const fullDateDir = path.join(rootDir, dateDir);
      if (!fs.statSync(fullDateDir).isDirectory()) continue;

      for (const fileNameWithExt of fs.readdirSync(fullDateDir).filter((file) => file.endsWith(".json"))) {
        const fileName = path.basename(fileNameWithExt, ".json");
        const payload = safeReadJson<Record<string, unknown> | null>(
          path.join(fullDateDir, fileNameWithExt),
          null,
        );

        const trackerPlatform = inferVariantPlatform(fileName, payload);
        const trackerSurface = inferVariantSurface(fileName, payload);
        if (trackerPlatform === platform && (!surface || trackerSurface === surface)) {
          for (const key of collectArchetypeKeys(payload)) keys.add(key);
        }

        if (typeof platform === "string") {
          const nested = collectNestedPlatformRecord(payload, platform as SocialHistoryPlatform);
          const nestedSurface = inferNestedVariantSurface(nested);
          if (nested && (!surface || nestedSurface === surface)) {
            for (const key of collectArchetypeKeys(nested)) keys.add(key);
          }
        }
      }
    }
  }

  return keys;
}

function collectRecentSocialMetadata(
  dataDir: string,
  platform: SocialHistoryPlatform,
  days: number,
  now: Date,
  collect: (payload: Record<string, unknown> | null | undefined) => string[],
): Set<string> {
  const values = new Set<string>();
  const cutoffKey = dateKeyDaysAgo(days, now);

  for (const rootName of ["posted", "posted_video"]) {
    const rootDir = path.join(dataDir, rootName);
    if (!fs.existsSync(rootDir)) continue;

    for (const dateDir of fs.readdirSync(rootDir).filter(isDateDir)) {
      if (dateDir < cutoffKey) continue;

      const fullDateDir = path.join(rootDir, dateDir);
      if (!fs.statSync(fullDateDir).isDirectory()) continue;

      for (const fileNameWithExt of fs.readdirSync(fullDateDir).filter((file) => file.endsWith(".json"))) {
        const fileName = path.basename(fileNameWithExt, ".json");
        const payload = safeReadJson<Record<string, unknown> | null>(
          path.join(fullDateDir, fileNameWithExt),
          null,
        );

        const trackerPlatform = inferVariantPlatform(fileName, payload);
        if (trackerPlatform === platform) {
          for (const value of collect(payload)) values.add(value);
        }

        const nested = collectNestedPlatformRecord(payload, platform);
        if (nested) {
          for (const value of collect(nested)) values.add(value);
        }
      }
    }
  }

  return values;
}

export function getRecentSocialHookFamilies(
  dataDir: string,
  platform: SocialHistoryPlatform,
  days: number,
  now: Date = new Date(),
): Set<string> {
  return collectRecentSocialMetadata(dataDir, platform, days, now, collectHookFamilies);
}

export function getRecentSocialCtaFamilies(
  dataDir: string,
  platform: SocialHistoryPlatform,
  days: number,
  now: Date = new Date(),
): Set<string> {
  return collectRecentSocialMetadata(dataDir, platform, days, now, collectCtaFamilies);
}
