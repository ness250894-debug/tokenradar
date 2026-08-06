import * as fs from "fs";
import * as path from "path";

import type { SocialPostRecord } from "../../src/lib/ops-ledger";
import { buildSocialPostDetails } from "../../src/lib/social-post-tracker";

type TrackerPayload = Record<string, unknown>;

const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRACKER_PLATFORM_SUFFIX_RE = /-(telegram|x|instagram|threads|youtube|tiktok)$/;
const SPECIAL_POSTED_FILES = new Set([
  "daily-instagram-movers.json",
  "daily-telegram-movers.json",
  "daily-telegram-poll.json",
  "daily-threads-text.json",
  "weekly-telegram-recap.json",
  "weekly-threads-recap.json",
  "interactive-daily.json",
  "token-comparison-telegram.json",
  "token-comparison-x.json",
  "token-comparison-instagram.json",
  "token-comparison-threads.json",
]);

function readTracker(filePath: string): TrackerPayload | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as TrackerPayload : null;
  } catch {
    return null;
  }
}

function stringField(payload: TrackerPayload, field: string): string | undefined {
  const value = payload[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberOrStringField(payload: TrackerPayload, field: string): string | number | undefined {
  const value = payload[field];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function postedAtFor(date: string, payload: TrackerPayload): string {
  return stringField(payload, "postedAt") || `${date}T00:00:00.000Z`;
}

function externalId(payload: TrackerPayload): string | number | undefined {
  for (const field of [
    "externalId",
    "tweetId",
    "messageId",
    "postId",
    "videoId",
    "publishId",
    "id",
    "reportVideoMessageId",
    "reportSummaryMessageId",
  ]) {
    const value = numberOrStringField(payload, field);
    if (value !== undefined) return value;
  }

  return undefined;
}

function record(
  date: string,
  platform: string,
  contentKey: string,
  payload: TrackerPayload,
  details: TrackerPayload = {},
): SocialPostRecord {
  return {
    platform,
    contentKey,
    externalId: externalId(payload),
    postedAt: postedAtFor(date, payload),
    details: {
      backfilled: true,
      sourceTracker: true,
      ...buildSocialPostDetails(payload),
      ...details,
    },
  };
}

function tokenIdFromMarketTracker(fileName: string): { tokenId: string; platform?: string } | null {
  const baseName = fileName.replace(/\.json$/, "");
  if (!baseName || SPECIAL_POSTED_FILES.has(fileName)) return null;

  const platformMatch = baseName.match(TRACKER_PLATFORM_SUFFIX_RE);
  if (platformMatch) {
    return {
      tokenId: baseName.slice(0, -platformMatch[0].length),
      platform: platformMatch[1],
    };
  }

  return { tokenId: baseName };
}

function inferMarketPlatform(fileName: string, payload: TrackerPayload): string | null {
  const platform = stringField(payload, "platform") || stringField(payload, "requestedPlatform");
  if (platform) return platform;
  return tokenIdFromMarketTracker(fileName)?.platform || null;
}

function collectPostedRecords(dataDir: string): SocialPostRecord[] {
  const postedRoot = path.join(dataDir, "posted");
  if (!fs.existsSync(postedRoot)) return [];

  const records: SocialPostRecord[] = [];
  for (const dateDir of fs.readdirSync(postedRoot).sort()) {
    if (!DATE_DIR_RE.test(dateDir)) continue;

    const fullDateDir = path.join(postedRoot, dateDir);
    if (!fs.statSync(fullDateDir).isDirectory()) continue;

    for (const fileName of fs.readdirSync(fullDateDir).sort()) {
      if (!fileName.endsWith(".json")) continue;
      const payload = readTracker(path.join(fullDateDir, fileName));
      if (!payload) continue;

      if (fileName === "interactive-daily.json") {
        records.push(record(dateDir, "x", `${dateDir}:interactive-poll`, payload, {
          tokenId: stringField(payload, "tokenId") || null,
          pollType: stringField(payload, "pollType") || null,
        }));
        continue;
      }

      if (fileName === "daily-telegram-poll.json") {
        records.push(record(dateDir, "telegram", `${dateDir}:telegram-poll`, payload, {
          theme: stringField(payload, "theme") || null,
        }));
        continue;
      }

      if (fileName === "daily-telegram-movers.json") {
        records.push(record(dateDir, "telegram", `${dateDir}:telegram-movers`, payload, {
          movers: Array.isArray(payload.movers) ? payload.movers : null,
        }));
        continue;
      }

      if (fileName === "daily-instagram-movers.json") {
        records.push(record(dateDir, "instagram", `${dateDir}:instagram-carousel`, payload));
        continue;
      }

      if (fileName === "daily-threads-text.json") {
        records.push(record(dateDir, "threads", `${dateDir}:threads-text`, payload, {
          tokenId: stringField(payload, "tokenId") || null,
        }));
        continue;
      }

      if (fileName === "weekly-threads-recap.json") {
        records.push(record(dateDir, "threads", `${dateDir}:threads-weekly-recap`, payload, {
          tokenIds: Array.isArray(payload.tokenIds) ? payload.tokenIds : null,
        }));
        continue;
      }

      if (fileName === "weekly-telegram-recap.json") {
        records.push(record(dateDir, "telegram", `${dateDir}:telegram-weekly-recap`, payload, {
          tokenIds: Array.isArray(payload.tokenIds) ? payload.tokenIds : null,
        }));
        continue;
      }

      const comparisonMatch = fileName.match(/^token-comparison-(telegram|x|instagram|threads)\.json$/);
      if (comparisonMatch) {
        records.push(record(dateDir, comparisonMatch[1], `${dateDir}:token-comparison`, payload, {
          tokenIds: Array.isArray(payload.tokenIds) ? payload.tokenIds : null,
        }));
        continue;
      }

      const marketTracker = tokenIdFromMarketTracker(fileName);
      const platform = inferMarketPlatform(fileName, payload);
      if (!marketTracker || !marketTracker.tokenId || !platform) continue;

      records.push(record(dateDir, platform, `${dateDir}:market-update:${marketTracker.tokenId}`, payload, {
        tokenId: marketTracker.tokenId,
        reason: stringField(payload, "reason") || null,
      }));
    }
  }

  return records;
}

function collectPostedVideoRecords(dataDir: string): SocialPostRecord[] {
  const postedVideoRoot = path.join(dataDir, "posted_video");
  if (!fs.existsSync(postedVideoRoot)) return [];

  const records: SocialPostRecord[] = [];
  for (const dateDir of fs.readdirSync(postedVideoRoot).sort()) {
    if (!DATE_DIR_RE.test(dateDir)) continue;

    const trackerPath = path.join(postedVideoRoot, dateDir, "daily-video.json");
    if (!fs.existsSync(trackerPath)) continue;

    const payload = readTracker(trackerPath);
    const tokenId = payload ? stringField(payload, "tokenId") : undefined;
    const platforms = payload?.platforms;
    if (!payload || !tokenId || !platforms || typeof platforms !== "object" || Array.isArray(platforms)) continue;

    for (const [platform, platformPayload] of Object.entries(platforms as Record<string, unknown>)) {
      if (!platformPayload || typeof platformPayload !== "object" || Array.isArray(platformPayload)) continue;
      const tracker = platformPayload as TrackerPayload;
      records.push(record(dateDir, platform, `${dateDir}:video:${tokenId}:${platform}`, tracker, {
        tokenId,
        source: "posted_video",
        deliveryMode: stringField(tracker, "deliveryMode") || null,
      }));
    }
  }

  return records;
}

export function collectBackfillSocialPosts(dataDir: string): SocialPostRecord[] {
  const byKey = new Map<string, SocialPostRecord>();

  for (const item of [...collectPostedRecords(dataDir), ...collectPostedVideoRecords(dataDir)]) {
    byKey.set(`${item.platform}\n${item.contentKey}`, item);
  }

  return Array.from(byKey.values()).sort((a, b) =>
    `${a.postedAt || ""}:${a.platform}:${a.contentKey}`.localeCompare(`${b.postedAt || ""}:${b.platform}:${b.contentKey}`),
  );
}
