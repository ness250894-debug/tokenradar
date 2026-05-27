/**
 * Multi-platform video auto-poster for the daily breakout token.
 * Supports: Telegram, X, YouTube, Instagram, Threads, and TikTok API upload/manual reporting.
 *
 * Usage:
 *   npx tsx scripts/post-video-daily.ts
 *   npx tsx scripts/post-video-daily.ts --platform x --dry-run
 *   npx tsx scripts/post-video-daily.ts --platform instagram --dry-run
 *   npx tsx scripts/post-video-daily.ts --platform tiktok --dry-run
 *   npx tsx scripts/post-video-daily.ts --force
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

import { logError } from "../src/lib/reporter";
import {
  generateUnifiedCaptions,
  type PlatformTarget,
  type UnifiedCaptionOptions,
} from "../src/lib/gemini";
import { uploadToYouTubeShorts } from "../src/lib/youtube";
import { buildTelegramMediaCaption, sendTelegramVideo } from "../src/lib/telegram";
import { diversifyXPostText, getMissingXCredentialNames, postTweetWithMedia, postTweet } from "../src/lib/x-client";
import {
  SOCIAL,
  SOCIAL_PLATFORM_LIMITS,
  VIDEO_COOLDOWN_DAYS,
  VIDEO_FORMAT_COOLDOWN_DAYS,
  getTelegramFooter,
  TELEGRAM_SIGNAL_NOTE,
} from "../src/lib/config";
import { formatErrorForLog, safeReadJson, loadEnv } from "../src/lib/utils";
import { getTimeOfDay, getRandomTone } from "../src/lib/shared-utils";
import { generateHookText, generateVideoVoiceoverScript } from "../src/lib/social-content-generator";
import { generateKokoroVoiceover } from "../src/lib/kokoro-voiceover";
import { publishVideo as publishMetaVideo, hasMetaCredentials, type TextEntity } from "../src/lib/meta-client";
import {
  cleanPrefix,
  deleteObjects,
  downloadObject,
  uploadVideo as uploadToR2,
  hasR2Credentials,
} from "../src/lib/r2-client";
import { buildR2VideoAssetKey } from "../src/lib/video-asset-r2";
import { hasSocialPost, recordAutomationRun, recordSocialPost } from "../src/lib/ops-ledger";
import {
  hasTikTokManualReportCredentials,
  sendTikTokInboxUploadReport,
  sendTikTokManualPostReport,
} from "../src/lib/tiktok-manual";
import {
  getTikTokCredentialMode,
  hasTikTokApiCredentials,
  normalizeTikTokCaption,
  publishVideoDirectlyToTikTok,
  uploadVideoToTikTokInbox,
} from "../src/lib/tiktok-client";
import { AUDIO_TRACKS, getAudioPath, selectAvailableAudioTrack } from "../src/lib/audio-config";
import {
  normalizeVideoAssetManifest,
  selectVideoAssetShotList,
  type VideoAssetLayer,
  type VideoAssetStageSegment,
  type VideoAssetUsageRecord,
  type VideoAssetManifest,
  type VideoMediaStage,
} from "../src/lib/video-assets";
import { resolveFfprobePath } from "../src/lib/video-asset-metadata";
import {
  formatVideoFormatPromptLine,
  getVideoFormat,
  selectVideoFormatsForSlots,
  type VideoFormat,
  type VideoFormatKey,
} from "../src/lib/video-formats";
import {
  selectVideoVisualRecipe,
  type VideoVisualRecipe,
} from "../src/lib/video-recipes";
import {
  buildTikTokInVideoScenePlan,
  type TikTokScenePlan,
} from "../src/lib/tiktok-scene-planner";
import { getVideoRenderProfile } from "../src/lib/video-render-profile";
import {
  buildGeneratedFallbackAssetId,
  buildVideoIdempotencyKey,
  buildVideoProductionAlert,
  classifyVideoPublishError,
  filterVideoCandidatesByFreshness,
  isTerminalVideoPublishStatus,
  reconcilePlatformPublishState,
  validatePlatformCopyPackage,
  validateVideoMarketDataFreshness,
  type VideoPublishStatus,
} from "../src/lib/video-production-controls";
import {
  type MetricData,
  type TokenData,
  cleanupExpiredCooldownFolders,
  getTodayPostedTokens,
  getRecentlyPostedTokens,
  loadCandidateTokens,
  selectToken,
} from "./lib/token-selection";
import { getRecentPlatformTexts } from "./lib/social-history";

const DATA_DIR = path.resolve(__dirname, "../data");
const VIDEO_ASSET_ROOT = path.resolve(process.cwd(), "public", "video-assets");

export type PlatformName = "telegram" | "x" | "youtube" | "instagram" | "threads" | "tiktok";
export type PlatformRoute = PlatformName | "all" | "shorts";

const PLATFORM_ROUTES: readonly PlatformRoute[] = [
  "all",
  "shorts",
  "telegram",
  "x",
  "youtube",
  "instagram",
  "threads",
  "tiktok",
];

export interface VideoDailyCliOptions {
  dryRun: boolean;
  force: boolean;
  includeLinkReply: boolean;
  outputDirArg: string | undefined;
  keepOutput: boolean;
  targetPlatform: PlatformRoute;
}

export interface VideoDailyPlatformFlags {
  runTelegram: boolean;
  runX: boolean;
  runYouTube: boolean;
  runInstagram: boolean;
  runThreads: boolean;
  runTikTok: boolean;
}

export interface VideoDailyCredentialState {
  hasYouTubeCredentials: boolean;
  hasInstagramCredentials: boolean;
  hasThreadsCredentials: boolean;
  hasTikTokApiCredentialsConfigured: boolean;
  tiktokCredentialMode: "production" | "sandbox";
  hasTikTokReportCredentials: boolean;
}

export interface VideoDailyPlatformPlan extends VideoDailyPlatformFlags {
  shouldRunYouTube: boolean;
  shouldRunInstagram: boolean;
  shouldRunThreads: boolean;
  shouldRunTikTokDirect: boolean;
  shouldRunTikTokInbox: boolean;
  shouldRunTikTokManual: boolean;
  shouldRunTikTok: boolean;
  intendedPlatforms: PlatformName[];
  requestedPlatforms: PlatformName[];
  skippedByMissingCredentials: PlatformName[];
}

interface PlatformTracker {
  postedAt: string;
  status?: VideoPublishStatus;
  messageId?: number;
  tweetId?: string;
  replyId?: string;
  xText?: string;
  videoId?: string;
  postId?: string;
  caption?: string;
  youtubeTitle?: string;
  youtubeDescription?: string;
  formatKey?: VideoFormatKey;
  formatLabel?: string;
  formatFamily?: string;
  videoThesis?: string;
  hookText?: string;
  voiceoverScript?: string;
  voiceoverProvider?: "kokoro";
  voiceoverStatus?: "generated" | "skipped" | "failed";
  voiceoverError?: string;
  audioTrack?: string;
  audioStartSeconds?: number;
  visualRecipeKey?: string;
  visualRecipe?: VideoVisualRecipe;
  mediaAssetIds?: string[];
  mediaAssets?: VideoAssetLayer[];
  mediaSegments?: VideoAssetStageSegment[];
  mediaFallbackLevel?: string;
  mediaFallbackWarnings?: string[];
  mediaStage?: VideoMediaStage;
  tiktokScenePlan?: TikTokScenePlan;
  reportVideoMessageId?: number;
  reportSummaryMessageId?: number;
  reportCaptionMessageIds?: number[];
  publishId?: string;
  tiktokStatus?: string;
  tiktokFailReason?: string;
  tiktokCaption?: string;
  tiktokPrivacyLevel?: string;
  tiktokCreatorUsername?: string;
  deliveryMode?: "content-posting-api-direct" | "content-posting-api-inbox" | "direct" | "telegram-report-manual";
  publishError?: string;
  publishFailureClass?: string;
  publishRetryable?: boolean;
  idempotencyKey?: string;
  manualPublishedAt?: string;
  tiktokUrl?: string;
  humanOperator?: string;
}

interface VideoTracker {
  postedAt: string;
  tokenId: string;
  tokenName: string;
  reason: string;
  platform: string;
  // Legacy single-render fields kept so old tracker files can still seed cooldown reads.
  formatKey?: VideoFormatKey;
  formatLabel?: string;
  formatFamily?: string;
  videoThesis?: string;
  hookText?: string;
  voiceoverScript?: string;
  voiceoverProvider?: "kokoro";
  voiceoverStatus?: "generated" | "skipped" | "failed";
  voiceoverError?: string;
  audioTrack?: string;
  audioStartSeconds?: number;
  visualRecipeKey?: string;
  visualRecipe?: VideoVisualRecipe;
  mediaAssetIds?: string[];
  mediaAssets?: VideoAssetLayer[];
  mediaSegments?: VideoAssetStageSegment[];
  mediaFallbackLevel?: string;
  mediaFallbackWarnings?: string[];
  mediaStage?: VideoMediaStage;
  tiktokScenePlan?: TikTokScenePlan;
  platforms: Partial<Record<PlatformName, PlatformTracker>>;
}

interface AudioTrackSelection {
  file: string;
  startSeconds: number;
}

interface PlatformVideoAsset {
  platform: PlatformName;
  outputPath: string;
  buffer: Buffer;
  format: VideoFormat;
  videoThesis: string;
  hookText: string;
  audioTrack: AudioTrackSelection;
  voiceoverScript: string;
  voiceoverFile?: string;
  voiceoverOutputPath?: string;
  voiceoverProvider?: "kokoro";
  voiceoverStatus?: "generated" | "skipped" | "failed";
  voiceoverError?: string;
  visualRecipe: VideoVisualRecipe;
  mediaAssets: VideoAssetLayer[];
  mediaSegments: VideoAssetStageSegment[];
  mediaFallbackLevel: string;
  mediaFallbackWarnings: string[];
  mediaStage: VideoMediaStage;
  tiktokScenePlan?: TikTokScenePlan;
}

interface RenderProbe {
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
  }>;
  format?: {
    duration?: string;
    size?: string;
  };
}

function getVideoSocialPostKey(today: string, tokenId: string, platform: PlatformName): string {
  return `${today}:video:${tokenId}:${platform}`;
}

function getPlatformTrackerExternalId(tracker: PlatformTracker): string | number | undefined {
  return tracker.messageId ??
    tracker.tweetId ??
    tracker.videoId ??
    tracker.postId ??
    tracker.publishId ??
    tracker.reportVideoMessageId ??
    tracker.reportSummaryMessageId;
}

function shouldRecordPublishedSocialPost(tracker: PlatformTracker): boolean {
  return tracker.status === "published" ||
    tracker.status === "manual_handoff_sent" ||
    tracker.status === "manual_published";
}

function isPlatformCompleteForRun(tracker: PlatformTracker | undefined): boolean {
  if (!tracker) return false;
  return tracker.status ? isTerminalVideoPublishStatus(tracker.status) : Boolean(getPlatformTrackerExternalId(tracker));
}

function ensureRiskDisclaimer(text: string): string {
  const normalized = text.toLowerCase();
  if (
    normalized.includes("not financial advice") ||
    normalized.includes("research signal") ||
    normalized.includes("confirm liquidity")
  ) {
    return text;
  }

  return [text.trim(), TELEGRAM_SIGNAL_NOTE].filter(Boolean).join("\n\n");
}

const TIKTOK_RESEARCH_CONTEXT_NOTE = "Educational market context. Confirm liquidity, risk, and invalidation.";

export function ensureTikTokResearchContextNote(text: string): string {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();
  if (
    normalized.includes("educational market context") ||
    normalized.includes("confirm liquidity")
  ) {
    return trimmed;
  }

  return [trimmed, TIKTOK_RESEARCH_CONTEXT_NOTE].filter(Boolean).join("\n\n");
}

function failWithVideoAlert(
  failureClass: Parameters<typeof buildVideoProductionAlert>[0]["failureClass"],
  videoDate: string,
  format: string,
  message: string,
  platform?: PlatformName,
): never {
  const alert = buildVideoProductionAlert({
    failureClass,
    workflowRunId: process.env.GITHUB_RUN_ID || process.env.TOKENRADAR_RUN_ID,
    videoDate,
    format,
    platform,
  });
  console.error(`  ${alert.message}`);
  console.error(`  Runbook: ${alert.nextRunbookAction}`);
  throw new Error(message);
}

function cleanupFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function getLocalVideoAssetPath(asset: VideoAssetLayer): string {
  return path.join(VIDEO_ASSET_ROOT, asset.src.replace(/\//g, path.sep));
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function isLocalVideoAssetAvailable(asset: VideoAssetLayer): boolean {
  if (asset.source !== "local") return true;
  const localPath = getLocalVideoAssetPath(asset);
  if (!fs.existsSync(localPath)) return false;
  return !asset.sha256 || sha256File(localPath) === asset.sha256;
}

function getArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
}

function isPlatformRoute(value: string): value is PlatformRoute {
  return PLATFORM_ROUTES.includes(value as PlatformRoute);
}

export function parseVideoDailyCliOptions(args: string[]): VideoDailyCliOptions {
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const includeLinkReply = args.includes("--link-reply");
  const outputDirArg = getArgValue(args, "--output-dir");
  const keepOutput = args.includes("--keep-output") || Boolean(outputDirArg);
  const platformIdx = args.indexOf("--platform");
  const targetPlatform = platformIdx !== -1 && platformIdx + 1 < args.length ? args[platformIdx + 1] : "all";

  if (!isPlatformRoute(targetPlatform)) {
    throw new Error(
      "Invalid --platform value. Expected one of: all, shorts, telegram, x, youtube, instagram, threads, tiktok.",
    );
  }

  return {
    dryRun,
    force,
    includeLinkReply,
    outputDirArg,
    keepOutput,
    targetPlatform,
  };
}

function getRemotionCliPath(): string {
  return path.join(
    process.cwd(),
    "node_modules",
    "@remotion",
    "cli",
    "remotion-cli.js",
  );
}

function validateRenderedVideoOutput(filePath: string, platform: PlatformName): void {
  const renderProfile = getVideoRenderProfile(platform);

  if (!fs.existsSync(filePath)) {
    throw new Error(`${platform}: rendered video file does not exist: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  if (stats.size <= 0) {
    throw new Error(`${platform}: rendered video file is empty`);
  }
  if (stats.size > 500 * 1024 * 1024) {
    throw new Error(`${platform}: rendered video file is too large (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
  }

  const output = execFileSync(
    resolveFfprobePath(),
    ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration,size", "-of", "json", filePath],
    { encoding: "utf-8" },
  );
  const probe = JSON.parse(output) as RenderProbe;
  const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
  const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format?.duration);

  if (!videoStream) throw new Error(`${platform}: rendered video is missing a video stream`);
  if (!audioStream) throw new Error(`${platform}: rendered video is missing an audio stream`);
  if (videoStream.width !== 1080 || videoStream.height !== 1920) {
    throw new Error(`${platform}: rendered video has wrong dimensions ${videoStream.width}x${videoStream.height}`);
  }
  if (
    !Number.isFinite(duration) ||
    duration < renderProfile.minDurationSeconds ||
    duration > renderProfile.maxDurationSeconds
  ) {
    throw new Error(`${platform}: rendered video duration is outside tolerance (${duration}s)`);
  }
}

function getVideoCooldownTokens(dataDir: string, days: number): Set<string> {
  const posted = new Set<string>();
  const parentDir = path.join(dataDir, "posted_video");
  if (!fs.existsSync(parentDir)) return posted;

  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffKey = cutoff.toISOString().split("T")[0];

  const dateDirs = fs.readdirSync(parentDir).filter((d) => {
    const fullPath = path.join(parentDir, d);
    return fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d);
  });

  for (const dateDir of dateDirs) {
    if (dateDir >= cutoffKey) {
      const trackerFile = path.join(parentDir, dateDir, "daily-video.json");
      if (fs.existsSync(trackerFile)) {
        try {
          const tracker = JSON.parse(fs.readFileSync(trackerFile, "utf-8"));
          if (tracker.tokenId) posted.add(tracker.tokenId);
        } catch (_e) { /* ignore */ }
      }
    }
  }

  return posted;
}

function getRecentVideoFormatKeys(
  dataDir: string,
  days: number,
  now: Date = new Date(),
  excludeDateKey?: string,
  platform?: PlatformName,
): Set<string> {
  const used = new Set<string>();
  const parentDir = path.join(dataDir, "posted_video");
  if (!fs.existsSync(parentDir)) return used;

  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffKey = cutoff.toISOString().split("T")[0];

  const dateDirs = fs.readdirSync(parentDir).filter((dateDir) => {
    const fullPath = path.join(parentDir, dateDir);
    return fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(dateDir);
  });

  for (const dateDir of dateDirs) {
    if (dateDir < cutoffKey || dateDir === excludeDateKey) continue;
    const trackerFile = path.join(parentDir, dateDir, "daily-video.json");
    const tracker = safeReadJson<VideoTracker | null>(trackerFile, null);
    if (!tracker) continue;

    if (platform) {
      const platformTracker = tracker.platforms?.[platform];
      if (platformTracker?.formatKey) {
        used.add(platformTracker.formatKey);
      } else if (tracker.formatKey) {
        // Legacy tracker support from the single-video format rotation.
        used.add(tracker.formatKey);
      }
      continue;
    }

    if (tracker.formatKey) used.add(tracker.formatKey);
    for (const platformTracker of Object.values(tracker.platforms || {})) {
      if (platformTracker?.formatKey) used.add(platformTracker.formatKey);
    }
  }

  return used;
}

function getRecentVideoRecipeKeys(
  dataDir: string,
  days: number,
  now: Date = new Date(),
  excludeDateKey?: string,
  platform?: PlatformName,
): Set<string> {
  const used = new Set<string>();
  const parentDir = path.join(dataDir, "posted_video");
  if (!fs.existsSync(parentDir)) return used;

  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffKey = cutoff.toISOString().split("T")[0];

  const dateDirs = fs.readdirSync(parentDir).filter((dateDir) => {
    const fullPath = path.join(parentDir, dateDir);
    return fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(dateDir);
  });

  for (const dateDir of dateDirs) {
    if (dateDir < cutoffKey || dateDir === excludeDateKey) continue;
    const trackerFile = path.join(parentDir, dateDir, "daily-video.json");
    const tracker = safeReadJson<VideoTracker | null>(trackerFile, null);
    if (!tracker) continue;

    if (platform) {
      const platformTracker = tracker.platforms?.[platform];
      const recipeKey = platformTracker?.visualRecipeKey || platformTracker?.visualRecipe?.key || tracker.visualRecipeKey;
      if (recipeKey) used.add(recipeKey);
      continue;
    }

    if (tracker.visualRecipeKey) used.add(tracker.visualRecipeKey);
    if (tracker.visualRecipe?.key) used.add(tracker.visualRecipe.key);
    for (const platformTracker of Object.values(tracker.platforms || {})) {
      if (platformTracker?.visualRecipeKey) used.add(platformTracker.visualRecipeKey);
      if (platformTracker?.visualRecipe?.key) used.add(platformTracker.visualRecipe.key);
    }
  }

  return used;
}

function getRecentVideoAssetUsageRecords(
  dataDir: string,
  days: number,
  now: Date = new Date(),
  excludeDateKey?: string,
): VideoAssetUsageRecord[] {
  const records: VideoAssetUsageRecord[] = [];
  const parentDir = path.join(dataDir, "posted_video");
  if (!fs.existsSync(parentDir)) return records;

  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffKey = cutoff.toISOString().split("T")[0];

  const dateDirs = fs.readdirSync(parentDir).filter((dateDir) => {
    const fullPath = path.join(parentDir, dateDir);
    return fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(dateDir);
  });

  for (const dateDir of dateDirs) {
    if (dateDir < cutoffKey || dateDir === excludeDateKey) continue;
    const trackerFile = path.join(parentDir, dateDir, "daily-video.json");
    const tracker = safeReadJson<VideoTracker | null>(trackerFile, null);
    if (!tracker) continue;

    for (const [platform, platformTracker] of Object.entries(tracker.platforms || {}) as Array<[PlatformName, PlatformTracker]>) {
      const usedAt = platformTracker.postedAt || tracker.postedAt || `${dateDir}T00:00:00.000Z`;
      if (platformTracker.mediaSegments?.length) {
        for (const segment of platformTracker.mediaSegments) {
          records.push({
            assetId: segment.asset.id,
            platform,
            usedAt,
            segmentId: segment.segmentId,
          });
        }
        continue;
      }

      for (const assetId of platformTracker.mediaAssetIds || []) {
        records.push({ assetId, platform, usedAt });
      }
    }
  }

  return records;
}

function normalizePersistedMediaSegments(
  segments: VideoAssetStageSegment[] | undefined,
): VideoAssetStageSegment[] {
  if (!Array.isArray(segments)) return [];

  return segments
    .map((segment) => {
      const asset = normalizeVideoAssetManifest({ assets: [segment.asset] }).assets[0];
      if (!asset) return undefined;
      return {
        ...segment,
        asset,
        startOffsetSeconds: typeof segment.startOffsetSeconds === "number" && segment.startOffsetSeconds >= 0
          ? segment.startOffsetSeconds
          : asset.startOffsetSeconds || 0,
      };
    })
    .filter((segment): segment is VideoAssetStageSegment => Boolean(segment));
}

function selectAudioTrackForRender(
  seed: string,
  existingPlatformTracker: PlatformTracker | undefined,
): AudioTrackSelection {
  const existingTrack = existingPlatformTracker?.audioTrack
    ? { file: existingPlatformTracker.audioTrack, startSeconds: existingPlatformTracker.audioStartSeconds || 0 }
    : undefined;
  const tracks = existingTrack
    ? [existingTrack, ...AUDIO_TRACKS.filter((track) => track.file !== existingTrack.file)]
    : AUDIO_TRACKS;
  const selection = selectAvailableAudioTrack(seed, {
    tracks,
    fileExists: (track) => fs.existsSync(path.resolve(process.cwd(), getAudioPath(track))),
  });

  for (const warning of selection.warnings) {
    console.warn(`  Audio fallback: ${warning}`);
  }
  if (selection.fallbackLevel !== "seeded-track") {
    console.warn(`  Audio fallback selected ${selection.track.file}.`);
  }

  return selection.track;
}

async function hydrateMediaSegmentsForRender(
  platform: PlatformName,
  segments: VideoAssetStageSegment[],
): Promise<{
  segments: VideoAssetStageSegment[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  const hydrated: VideoAssetStageSegment[] = [];
  const canUseR2 = hasR2Credentials();

  for (const segment of segments) {
    const asset = segment.asset;
    if (asset.source !== "local" || isLocalVideoAssetAvailable(asset)) {
      hydrated.push(segment);
      continue;
    }

    if (!canUseR2) {
      warnings.push(`asset-missing-local:${asset.id}`);
      continue;
    }

    try {
      const localPath = getLocalVideoAssetPath(asset);
      const body = await downloadObject(buildR2VideoAssetKey(asset.src));
      if (asset.sha256) {
        const actualHash = crypto.createHash("sha256").update(body).digest("hex");
        if (actualHash !== asset.sha256) {
          warnings.push(`asset-checksum-mismatch:${asset.id}`);
          continue;
        }
      }
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, body);
      hydrated.push(segment);
      console.log(`  ${platform}: hydrated media asset ${asset.id} from R2`);
    } catch (error) {
      warnings.push(`asset-r2-hydration-failed:${asset.id}`);
      console.warn(`  ${platform}: media hydration failed for ${asset.id}: ${formatErrorForLog(error)}`);
    }
  }

  return { segments: hydrated, warnings };
}

function buildVideoThesis(
  format: VideoFormat,
  token: TokenData,
  metric: MetricData | undefined,
  contextText: string | undefined,
): string {
  const context = contextText?.trim();
  const riskTone = metric?.riskScore !== undefined && metric.riskScore >= 7
    ? "elevated risk keeps confirmation more important than attention"
    : "risk and liquidity still need confirmation";

  const thesisByFormat: Partial<Record<VideoFormatKey, string>> = {
    breakout_watch: `${token.name} is being checked as a breakout story; the test is whether attention turns into follow-through.`,
    risk_alert: `${token.name} needs a risk-first read because ${riskTone}.`,
    volume_spike_check: `${token.name} is on move-quality watch because fast activity can be useful or noisy.`,
    sector_rotation: `${token.name} is being read as a possible rotation story; the question is whether the move fits the broader market setup.`,
    token_vs_sector: `${token.name} is being compared against the broader tape so the setup is not judged in isolation.`,
    momentum_cooling: `${token.name} is being checked for fade risk because strong attention can still cool fast.`,
    catalyst_explainer: `${token.name} is the focus because the selection reason needs a why-now explanation, not just a price snapshot.`,
    liquidity_stress_test: `${token.name} is going through a liquidity stress test where activity, depth, and risk have to agree.`,
    data_vs_hype: `${token.name} gets a data-versus-hype read because attention is only useful when the evidence holds up.`,
    risk_score_breakdown: `${token.name} is being judged through TokenRadar's risk lens first, with confirmation doing the heavy lifting.`,
    watchlist_battle: `${token.name} has to earn a watchlist slot with a cleaner story than simple attention.`,
    weekly_recap: `${token.name} is the standout name in this scan, but the market read still needs context.`,
    new_listing_radar: `${token.name} is treated as a fresh radar candidate; the first filters are risk, liquidity, and proof.`,
    narrative_heatmap: `${token.name} is being checked for narrative heat and whether the story is bigger than one fast move.`,
    contrarian_signal: `${token.name} has a tension setup: attention is visible, but confirmation still has to arrive.`,
  };

  return [thesisByFormat[format.key as VideoFormatKey] || `${format.label}: ${token.name} is being analyzed through market data quality filters.`, context]
    .filter(Boolean)
    .join(" ");
}

function getPlatformVideoAsset(
  platformVideos: Map<PlatformName, PlatformVideoAsset>,
  platform: PlatformName,
): PlatformVideoAsset {
  const asset = platformVideos.get(platform);
  if (!asset) {
    throw new Error(`Missing rendered video asset for ${platform}.`);
  }
  return asset;
}

function cloneVideoAssetForPlatform(asset: PlatformVideoAsset, platform: PlatformName): PlatformVideoAsset {
  return {
    ...asset,
    platform,
  };
}

function getPlatformTrackerFields(
  asset: PlatformVideoAsset,
  context: { date: string; tokenId: string; forceId?: string },
): Pick<
  PlatformTracker,
  | "idempotencyKey"
  | "formatKey"
  | "formatLabel"
  | "formatFamily"
  | "videoThesis"
  | "hookText"
  | "voiceoverScript"
  | "voiceoverProvider"
  | "voiceoverStatus"
  | "voiceoverError"
  | "audioTrack"
  | "audioStartSeconds"
  | "visualRecipeKey"
  | "visualRecipe"
  | "mediaAssetIds"
  | "mediaAssets"
  | "mediaSegments"
  | "mediaFallbackLevel"
  | "mediaFallbackWarnings"
  | "mediaStage"
  | "tiktokScenePlan"
> {
  const mediaAssetIds = asset.mediaAssets.length > 0
    ? asset.mediaAssets.map((mediaAsset) => mediaAsset.id)
    : asset.mediaFallbackLevel === "generated-only"
      ? [
        buildGeneratedFallbackAssetId({
          date: context.date,
          platform: asset.platform,
          tokenId: context.tokenId,
          formatKey: asset.format.key as string,
          recipeKey: asset.visualRecipe.key,
        }),
      ]
      : [];

  return {
    idempotencyKey: buildVideoIdempotencyKey({
      date: context.date,
      format: asset.format.key as string,
      tokenId: context.tokenId,
      platform: asset.platform,
      forceId: context.forceId,
    }),
    formatKey: asset.format.key as VideoFormatKey,
    formatLabel: asset.format.label,
    formatFamily: asset.format.family,
    videoThesis: asset.videoThesis,
    hookText: asset.hookText,
    voiceoverScript: asset.voiceoverScript,
    voiceoverProvider: asset.voiceoverProvider,
    voiceoverStatus: asset.voiceoverStatus,
    voiceoverError: asset.voiceoverError,
    audioTrack: asset.audioTrack.file,
    audioStartSeconds: asset.audioTrack.startSeconds,
    visualRecipeKey: asset.visualRecipe.key,
    visualRecipe: asset.visualRecipe,
    mediaAssetIds,
    mediaAssets: asset.mediaAssets,
    mediaSegments: asset.mediaSegments,
    mediaFallbackLevel: asset.mediaFallbackLevel,
    mediaFallbackWarnings: asset.mediaFallbackWarnings,
    mediaStage: asset.mediaStage,
    tiktokScenePlan: asset.tiktokScenePlan,
  };
}

function buildPlatformFormatPrompt(
  platformVideos: Map<PlatformName, PlatformVideoAsset>,
  platforms: PlatformTarget[],
): string {
  return platforms
    .map((platform) => {
      const asset = platformVideos.get(platform as PlatformName);
      const mediaSummary = asset?.mediaSegments.length
        ? asset.mediaSegments
          .map((segment) => `${segment.segmentId}:${segment.asset.id}@${segment.startOffsetSeconds}s`)
          .join(", ")
        : asset?.mediaAssets.map((mediaAsset) => mediaAsset.id).join(", ");
      const visualSummary = asset
        ? `Visual recipe: ${asset.visualRecipe.layoutPack}, ${asset.visualRecipe.chartPack}, ${asset.visualRecipe.backgroundSystem}.`
        : "";
      const sceneSummary = asset?.tiktokScenePlan
        ? `TikTok scene plan: ${asset.tiktokScenePlan.scenes.map((scene) => scene.intent).join(" > ")}.`
        : "";
      return asset
        ? `${platform}: ${formatVideoFormatPromptLine(asset.format)} ${visualSummary} ${sceneSummary} Media stage: ${asset.mediaStage}. Media: ${mediaSummary || "generated motion graphics only"}.`
        : "";
    })
    .filter(Boolean)
    .join("\n");
}

function getRequestedPlatforms(
  runTelegram: boolean,
  runX: boolean,
  runYouTube: boolean,
  runInstagram: boolean,
  runThreads: boolean,
  runTikTok: boolean,
): PlatformName[] {
  const requested: PlatformName[] = [];
  if (runTelegram) requested.push("telegram");
  if (runX) requested.push("x");
  if (runYouTube) requested.push("youtube");
  if (runInstagram) requested.push("instagram");
  if (runThreads) requested.push("threads");
  if (runTikTok) requested.push("tiktok");
  return requested;
}

const SHARED_VIDEO_RENDER_PLATFORM_PRIORITY: readonly PlatformName[] = [
  "tiktok",
  "youtube",
  "instagram",
  "threads",
  "telegram",
  "x",
];

export function resolveSharedVideoRenderPlatform(requestedPlatforms: readonly PlatformName[]): PlatformName {
  for (const platform of SHARED_VIDEO_RENDER_PLATFORM_PRIORITY) {
    if (requestedPlatforms.includes(platform)) return platform;
  }
  throw new Error("Cannot choose a shared video render platform without requested platforms.");
}

export function resolveVideoDailyPlatformFlags(targetPlatform: PlatformRoute): VideoDailyPlatformFlags {
  return {
    runTelegram: targetPlatform === "all" || targetPlatform === "telegram",
    runX: targetPlatform === "all" || targetPlatform === "x",
    runYouTube: targetPlatform === "all" || targetPlatform === "shorts" || targetPlatform === "youtube",
    runInstagram: targetPlatform === "all" || targetPlatform === "shorts" || targetPlatform === "instagram",
    runThreads: targetPlatform === "all" || targetPlatform === "shorts" || targetPlatform === "threads",
    runTikTok: targetPlatform === "all" || targetPlatform === "shorts" || targetPlatform === "tiktok",
  };
}

export function resolveVideoDailyPlatformPlan(
  targetPlatform: PlatformRoute,
  dryRun: boolean,
  credentials: VideoDailyCredentialState,
): VideoDailyPlatformPlan {
  const flags = resolveVideoDailyPlatformFlags(targetPlatform);
  const shouldRunYouTube = flags.runYouTube && (dryRun || credentials.hasYouTubeCredentials);
  const shouldRunInstagram = flags.runInstagram && (dryRun || credentials.hasInstagramCredentials);
  const shouldRunThreads = flags.runThreads && (dryRun || credentials.hasThreadsCredentials);
  const shouldRunTikTokDirect =
    flags.runTikTok &&
    credentials.hasTikTokApiCredentialsConfigured &&
    credentials.tiktokCredentialMode === "production";
  const shouldRunTikTokInbox =
    flags.runTikTok &&
    credentials.hasTikTokApiCredentialsConfigured &&
    credentials.tiktokCredentialMode === "sandbox" &&
    (dryRun || credentials.hasTikTokReportCredentials);
  const shouldRunTikTokManual =
    flags.runTikTok &&
    !credentials.hasTikTokApiCredentialsConfigured &&
    (dryRun || credentials.hasTikTokReportCredentials);
  const shouldRunTikTok =
    flags.runTikTok && (dryRun || shouldRunTikTokDirect || shouldRunTikTokInbox || shouldRunTikTokManual);
  const intendedPlatforms = getRequestedPlatforms(
    flags.runTelegram,
    flags.runX,
    flags.runYouTube,
    flags.runInstagram,
    flags.runThreads,
    flags.runTikTok,
  );
  const requestedPlatforms = getRequestedPlatforms(
    flags.runTelegram,
    flags.runX,
    shouldRunYouTube,
    shouldRunInstagram,
    shouldRunThreads,
    shouldRunTikTok,
  );

  return {
    ...flags,
    shouldRunYouTube,
    shouldRunInstagram,
    shouldRunThreads,
    shouldRunTikTokDirect,
    shouldRunTikTokInbox,
    shouldRunTikTokManual,
    shouldRunTikTok,
    intendedPlatforms,
    requestedPlatforms,
    skippedByMissingCredentials: intendedPlatforms.filter((platform) => !requestedPlatforms.includes(platform)),
  };
}

function isTrackerComplete(tracker: VideoTracker | null, requestedPlatforms: PlatformName[]): boolean {
  if (!tracker) return false;
  return requestedPlatforms.every((platform) => isPlatformCompleteForRun(tracker.platforms?.[platform]));
}

function extractInstagramContent(caption: string | undefined): { caption: string; hashtags: string[] } {
  const safeCaption = (caption || "").trim();
  const hashtags = (safeCaption.match(/#[a-zA-Z0-9_]+/g) || []).map((tag) => tag.slice(1));
  return { caption: safeCaption, hashtags };
}

function sanitizeThreadsTopicTag(topicTag: string | undefined): string {
  let sanitized = (topicTag || "crypto")
    .replace(/[#.&]/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!sanitized) sanitized = "crypto";
  if (sanitized.length > SOCIAL_PLATFORM_LIMITS.THREADS.TOPIC_TAG_MAX_LENGTH) {
    sanitized = sanitized.substring(0, SOCIAL_PLATFORM_LIMITS.THREADS.TOPIC_TAG_MAX_LENGTH);
  }

  return sanitized;
}

function buildThreadsContent(
  caption: string | undefined,
  topicTag: string | undefined,
  spoilerText: string | undefined,
  tokenName: string,
): { caption: string; topicTag: string; spoilerText: string; spoilerOffset: number; spoilerLength: number } {
  const maxChars = SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT;
  let safeSpoilerText = (spoilerText || tokenName).trim();
  if (!safeSpoilerText) safeSpoilerText = tokenName;

  let safeCaption = (caption || `This setup is moving fast. Watch the data behind ${tokenName}.`).trim();
  if (!safeCaption.includes(safeSpoilerText)) {
    const suffix = ` ${safeSpoilerText}`;
    const bodyBudget = maxChars - suffix.length;
    safeCaption = bodyBudget > 0
      ? `${safeCaption.substring(0, bodyBudget).trim()}${suffix}`.trim()
      : safeSpoilerText.substring(0, maxChars);
  }

  if (safeCaption.length > maxChars) {
    safeCaption = `${safeCaption.substring(0, maxChars - 3).trim()}...`;
  }

  if (!safeCaption.includes(safeSpoilerText)) {
    safeCaption = safeSpoilerText.length <= maxChars
      ? safeSpoilerText
      : safeSpoilerText.substring(0, maxChars);
  }

  const spoilerIndex = safeCaption.indexOf(safeSpoilerText);
  const textEncoder = new TextEncoder();
  const spoilerOffset = spoilerIndex >= 0
    ? textEncoder.encode(safeCaption.substring(0, spoilerIndex)).length
    : 0;
  const spoilerLength = spoilerIndex >= 0 ? textEncoder.encode(safeSpoilerText).length : 0;

  return {
    caption: safeCaption,
    topicTag: sanitizeThreadsTopicTag(topicTag),
    spoilerText: safeSpoilerText,
    spoilerOffset,
    spoilerLength,
  };
}

export async function main(args = process.argv.slice(2)) {
  const {
    dryRun,
    force,
    includeLinkReply,
    outputDirArg,
    keepOutput,
    targetPlatform,
  } = parseVideoDailyCliOptions(args);
  loadEnv();

  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  console.log("==========================================");
  console.log("  TokenRadar Daily Video Breakout");
  console.log("==========================================");
  console.log();
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Platform: ${targetPlatform}`);
  console.log();

  const outputDir = outputDirArg ? path.resolve(process.cwd(), outputDirArg) : process.cwd();
  if (keepOutput || outputDirArg) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const today = new Date().toISOString().split("T")[0];
  const postedDir = path.join(DATA_DIR, "posted_video", today);
  const trackerFile = path.join(postedDir, "daily-video.json");
  cleanupExpiredCooldownFolders(DATA_DIR, {
    videoRetentionDays: Math.max(VIDEO_COOLDOWN_DAYS, VIDEO_FORMAT_COOLDOWN_DAYS),
  });
  if (!fs.existsSync(postedDir)) fs.mkdirSync(postedDir, { recursive: true });

  const platformFlags = resolveVideoDailyPlatformFlags(targetPlatform);
  const hasYouTubeCredentials = Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN,
  );
  const hasInstagramCredentials = hasMetaCredentials("instagram") && hasR2Credentials();
  const hasThreadsCredentials = hasMetaCredentials("threads") && hasR2Credentials();
  const hasTikTokApiCredentialsConfigured = hasTikTokApiCredentials();
  const tiktokCredentialMode =
    platformFlags.runTikTok && hasTikTokApiCredentialsConfigured ? getTikTokCredentialMode() : "sandbox";
  const hasTikTokReportCredentials = hasTikTokManualReportCredentials();
  const {
    runTelegram,
    runX,
    shouldRunYouTube,
    shouldRunInstagram,
    shouldRunThreads,
    shouldRunTikTokDirect,
    shouldRunTikTokInbox,
    shouldRunTikTokManual,
    shouldRunTikTok,
    requestedPlatforms,
    skippedByMissingCredentials,
  } = resolveVideoDailyPlatformPlan(targetPlatform, dryRun, {
    hasYouTubeCredentials,
    hasInstagramCredentials,
    hasThreadsCredentials,
    hasTikTokApiCredentialsConfigured,
    tiktokCredentialMode,
    hasTikTokReportCredentials,
  });
  const {
    runYouTube,
    runInstagram,
    runThreads,
    runTikTok,
  } = platformFlags;

  const existingTracker =
    !force && fs.existsSync(trackerFile)
      ? safeReadJson<VideoTracker | null>(trackerFile, null)
      : null;

  if (!dryRun) {
    if (runTelegram && (!process.env.TELEGRAM_BOT_TOKEN || !channelId)) {
      console.error("  Missing Telegram credentials.");
      process.exit(1);
    }
    if (
      runX &&
      getMissingXCredentialNames().length > 0
    ) {
      console.error("  Missing X OAuth 2.0 credentials.");
      process.exit(1);
    }
    if (runYouTube && !hasYouTubeCredentials) {
      console.error("  Missing YouTube credentials.");
      if (targetPlatform === "youtube") process.exit(1);
      console.warn("  Continuing without YouTube because the requested target includes other platforms.");
    }
    if (runInstagram && !shouldRunInstagram) {
      console.warn("  Missing Instagram or R2 credentials. Skipping Instagram.");
      if (targetPlatform === "instagram") process.exit(1);
    }
    if (runThreads && !shouldRunThreads) {
      console.warn("  Missing Threads or R2 credentials. Skipping Threads.");
      if (targetPlatform === "threads") process.exit(1);
    }
    if (runTikTok && !hasTikTokApiCredentialsConfigured && !hasTikTokReportCredentials) {
      console.warn("  Missing TikTok API credentials and Telegram reporting credentials. Skipping TikTok.");
      if (targetPlatform === "tiktok") process.exit(1);
    }
    if (runTikTok && hasTikTokApiCredentialsConfigured && tiktokCredentialMode === "sandbox" && !hasTikTokReportCredentials) {
      console.warn("  Missing Telegram reporting credentials for TikTok sandbox handoff. Skipping TikTok.");
      if (targetPlatform === "tiktok") process.exit(1);
    }
    if (requestedPlatforms.length === 0) {
      failWithVideoAlert(
        "allPlatformsBlocked",
        today,
        targetPlatform,
        "No requested video platforms are publishable with the current credentials.",
      );
    }
  }
  console.log("Step 1: Loading candidate tokens...");
  const metricsDir = path.join(DATA_DIR, "metrics");
  const loadedCandidates = await loadCandidateTokens(DATA_DIR, 1, 50);
  const allTokensRegistry = loadedCandidates.allRegistry;
  const onWebsiteIds = loadedCandidates.onWebsiteIds;
  const metricCache = new Map<string, MetricData | undefined>();
  const readMetric = (tokenId: string): MetricData | undefined => {
    if (metricCache.has(tokenId)) return metricCache.get(tokenId);
    const metricFile = path.join(metricsDir, `${tokenId}.json`);
    const metric = fs.existsSync(metricFile)
      ? safeReadJson<MetricData>(metricFile, undefined as unknown as MetricData) || undefined
      : undefined;
    metricCache.set(tokenId, metric);
    return metric;
  };
  const freshnessNow = new Date();
  const candidateTokens = filterVideoCandidatesByFreshness(loadedCandidates.candidates, {
    now: freshnessNow,
    metric: undefined,
  }).filter((token) => {
    const metric = readMetric(token.id);
    return validateVideoMarketDataFreshness({ token, metric, now: freshnessNow }).ok;
  });
  const rejectedForFreshness = loadedCandidates.candidates.length - candidateTokens.length;
  if (rejectedForFreshness > 0) {
    console.warn(`  Skipped ${rejectedForFreshness} token(s) with stale or invalid video market data.`);
  }

  if (candidateTokens.length === 0) {
    failWithVideoAlert(
      "marketDataStale",
      today,
      targetPlatform,
      "No tokens passed video market-data freshness checks.",
    );
  }

  const todayPosted = force ? new Set<string>() : getTodayPostedTokens(DATA_DIR, today);
  const recentlyPosted = force ? new Set<string>() : getRecentlyPostedTokens(DATA_DIR);
  
  if (!force) {
    const videoCooldown = getVideoCooldownTokens(DATA_DIR, VIDEO_COOLDOWN_DAYS);
    for (const id of videoCooldown) {
      todayPosted.add(id);
    }
  }

  const selectionPlatform = runX ? "x" : runTelegram ? "telegram" : "all";

  console.log();
  console.log(`Step 2: Selecting top breakout token... (Force: ${force})`);

  let targetToken: TokenData | undefined;
  let reason = existingTracker?.reason || "spotlight";
  let trendingContext: string | undefined;

  if (existingTracker?.tokenId) {
    targetToken = candidateTokens.find((candidate) => candidate.id === existingTracker.tokenId);
    if (!targetToken) {
      console.error(`  Tracked video token ${existingTracker.tokenId} is no longer available in the candidate set.`);
      process.exit(1);
    }
    console.log(`  Resuming prior daily video token: ${targetToken.name} (${targetToken.symbol.toUpperCase()})`);
  } else {
    const selection = await selectToken(
      candidateTokens,
      todayPosted,
      recentlyPosted,
      metricsDir,
      allTokensRegistry,
      onWebsiteIds,
      selectionPlatform,
      force,
    );

    if (!selection) {
      console.error("  Could not select a target token.");
      process.exit(1);
    }

    targetToken = selection.token;
    reason = selection.reason;
    trendingContext = selection.trendingContext;
  }

  if (!targetToken) {
    console.error("  Could not determine a target token.");
    process.exit(1);
  }

  console.log(`  Selected: ${targetToken.name} (${targetToken.symbol.toUpperCase()})`);
  const d1AlreadyPublished = new Set<PlatformName>();
  if (!dryRun && !force) {
    for (const platform of requestedPlatforms) {
      if (await hasSocialPost(platform, getVideoSocialPostKey(today, targetToken.id, platform))) {
        d1AlreadyPublished.add(platform);
      }
    }

    for (const platform of requestedPlatforms) {
      const platformTracker = existingTracker?.platforms?.[platform];
      const reconciliation = reconcilePlatformPublishState({
        platform,
        d1HasPublishedState: d1AlreadyPublished.has(platform),
        tracker: platformTracker || null,
      });
      if (reconciliation.shouldBackfillD1 && platformTracker) {
        await recordSocialPost({
          platform,
          contentKey: getVideoSocialPostKey(today, targetToken.id, platform),
          externalId: getPlatformTrackerExternalId(platformTracker),
          postedAt: platformTracker.postedAt || existingTracker?.postedAt || new Date().toISOString(),
          details: {
            tokenId: targetToken.id,
            tokenName: targetToken.name,
            reason,
            requestedPlatform: targetPlatform,
            status: platformTracker.status || "published",
            reconciledFromTracker: true,
            variantSurface: "video",
          },
        });
        d1AlreadyPublished.add(platform);
      }
    }

    if (d1AlreadyPublished.size === requestedPlatforms.length) {
      console.log(
        `  Daily video already published for requested platforms (${requestedPlatforms.join(", ")}) according to D1. Exiting.`,
      );
      return;
    }

    if (isTrackerComplete(existingTracker, requestedPlatforms)) {
      console.log(
        `  Daily video already published for requested platforms (${requestedPlatforms.join(", ")}) at ${existingTracker?.postedAt}. Exiting.`,
      );
      return;
    }
  }

  const targetMetric = readMetric(targetToken.id);
  const targetFreshness = validateVideoMarketDataFreshness({
    token: targetToken,
    metric: targetMetric,
    now: new Date(),
  });
  if (!targetFreshness.ok) {
    failWithVideoAlert(
      "marketDataStale",
      today,
      targetPlatform,
      `Selected token ${targetToken.id} failed video market-data freshness checks: ${targetFreshness.issues.join(", ")}`,
    );
  }
  console.log(`  Market data as of: ${targetFreshness.asOf || "unknown"}`);
  const videoAutomationRunId = [
    "post-video-daily",
    today,
    targetPlatform,
    targetToken.id,
    process.env.GITHUB_RUN_ID || process.env.TOKENRADAR_RUN_ID || process.pid,
  ].join(":");
  if (!dryRun) {
    await recordAutomationRun({
      id: videoAutomationRunId,
      workflow: "post-video-daily",
      slot: targetPlatform,
      status: "started",
      details: {
        tokenId: targetToken.id,
        tokenName: targetToken.name,
        requestedPlatforms,
        marketDataAsOf: targetFreshness.asOf,
        metricsAsOf: targetFreshness.metricAsOf,
      },
    });
  }

  const context = {
    ...targetMetric,
    marketDataAsOf: targetFreshness.asOf,
    metricsAsOf: targetFreshness.metricAsOf,
    price: targetToken.market.price,
    priceChange24h: targetToken.market.priceChange24h,
    marketCap: targetToken.market.marketCap,
    marketCapRank: targetToken.market.marketCapRank,
    volume24h: targetToken.market.volume24h,
    trendingContext,
    timeOfDay: getTimeOfDay(),
    tone: getRandomTone(),
    selectionReason: reason,
  };

  const brollManifestFile = path.join(process.cwd(), "public", "video-assets", "broll", "manifest.json");
  const mediaManifest = normalizeVideoAssetManifest(
    fs.existsSync(brollManifestFile)
      ? safeReadJson<VideoAssetManifest | null>(brollManifestFile, null)
      : null,
  );
  if (mediaManifest.assets.length > 0) {
    console.log(`Loaded ${mediaManifest.assets.length} video media asset(s) from ${brollManifestFile}`);
  } else {
    console.log("No local video b-roll manifest found; using generated motion backgrounds only.");
  }

  console.log();
  console.log("Step 3: Rendering video with Remotion...");
  const platformVideos = new Map<PlatformName, PlatformVideoAsset>();
  const sharedRenderPlatform = resolveSharedVideoRenderPlatform(requestedPlatforms);
  const existingSharedRenderTracker =
    existingTracker?.platforms?.[sharedRenderPlatform] ||
    requestedPlatforms
      .map((platform) => existingTracker?.platforms?.[platform])
      .find((platformTracker): platformTracker is PlatformTracker => Boolean(platformTracker));
  const { getVerdict } = await import("../src/video/styles");
  const verdict = getVerdict(targetMetric?.riskScore || 5.0, targetToken.market.priceChange24h);
  const fixedFormatKeys = new Set(
    requestedPlatforms
      .map((platform) => existingTracker?.platforms?.[platform]?.formatKey)
      .filter((key): key is VideoFormatKey => Boolean(key)),
  );
  const getUsedFormatKeysForPlatform = (platform: PlatformName): Set<string> => {
    const used = force
      ? new Set<string>()
      : getRecentVideoFormatKeys(DATA_DIR, VIDEO_FORMAT_COOLDOWN_DAYS, new Date(), today, platform);
    for (const key of fixedFormatKeys) used.add(key);
    return used;
  };
  const generatedFormats = selectVideoFormatsForSlots(
    existingSharedRenderTracker?.formatKey ? [] : [sharedRenderPlatform],
    {
      getUsedFormatKeys: getUsedFormatKeysForPlatform,
      getSeedParts: (platform) => [today, platform, targetToken.id, reason],
    },
  );
  const fixedRecipeKeys = new Set(
    requestedPlatforms
      .map((platform) =>
        existingTracker?.platforms?.[platform]?.visualRecipeKey ||
        existingTracker?.platforms?.[platform]?.visualRecipe?.key,
      )
      .filter((key): key is string => Boolean(key)),
  );
  const selectedRecipeKeys = new Set<string>();
  const mediaUsageRecords = force
    ? []
    : getRecentVideoAssetUsageRecords(DATA_DIR, VIDEO_FORMAT_COOLDOWN_DAYS, new Date(), today);

  try {
    const platform = sharedRenderPlatform;
    const existingPlatformTracker = existingSharedRenderTracker;
    const renderProfile = getVideoRenderProfile(platform);
    const usedVideoFormatKeys = getUsedFormatKeysForPlatform(platform);

    const videoFormat = existingPlatformTracker?.formatKey
      ? getVideoFormat(existingPlatformTracker.formatKey)
      : generatedFormats.get(platform) || getVideoFormat(undefined);

    const videoThesis = existingPlatformTracker?.videoThesis ||
      buildVideoThesis(videoFormat, targetToken, targetMetric, context.trendingContext);
    const audioTrack = selectAudioTrackForRender(
      `${today}:shared:${videoFormat.key}:${targetToken.id}`,
      existingPlatformTracker,
    );
    const hookText = existingPlatformTracker?.hookText ||
      await generateHookText(targetToken.name, targetToken.symbol, context, videoFormat);
    const voiceoverScript = existingPlatformTracker?.voiceoverScript ||
      await generateVideoVoiceoverScript(targetToken.name, targetToken.symbol, context, videoFormat, {
        targetDurationSeconds: renderProfile.durationSeconds,
        style: platform === "tiktok" ? "tiktok_native" : "standard",
      });
    const voiceoverHash = crypto
      .createHash("sha1")
      .update(`${today}:shared:${targetToken.id}:${videoFormat.key}:${voiceoverScript}`)
      .digest("hex")
      .slice(0, 10);
    const voiceoverResult = await generateKokoroVoiceover({
      script: voiceoverScript,
      outputDir: path.join(VIDEO_ASSET_ROOT, "voiceover"),
      fileName: `${today}-shared-${targetToken.id}-${voiceoverHash}.wav`,
      dateSeed: today,
    });
    const usedVideoRecipeKeys = force
      ? new Set<string>()
      : getRecentVideoRecipeKeys(DATA_DIR, VIDEO_FORMAT_COOLDOWN_DAYS, new Date(), today, platform);
    for (const key of fixedRecipeKeys) usedVideoRecipeKeys.add(key);
    for (const key of selectedRecipeKeys) usedVideoRecipeKeys.add(key);
    const visualRecipe = existingPlatformTracker?.visualRecipe ||
      selectVideoVisualRecipe({
        usedRecipeKeys: usedVideoRecipeKeys,
        seedParts: [today, "shared", targetToken.id, videoFormat.key, reason],
      });
    selectedRecipeKeys.add(visualRecipe.key);
    const persistedMediaSegments = normalizePersistedMediaSegments(existingPlatformTracker?.mediaSegments);
    const shotList = persistedMediaSegments.length > 0
      ? {
        segments: persistedMediaSegments,
        fallbackLevel: existingPlatformTracker?.mediaFallbackLevel || "fresh",
        warnings: existingPlatformTracker?.mediaFallbackWarnings || [],
      }
      : selectVideoAssetShotList({
        manifest: mediaManifest,
        platform,
        seedParts: [today, "shared", targetToken.id, videoFormat.key, visualRecipe.key],
        usageRecords: mediaUsageRecords,
        now: new Date(),
        cooldownDays: VIDEO_FORMAT_COOLDOWN_DAYS,
        durationSeconds: renderProfile.durationSeconds,
      });
    let mediaSegments = shotList.segments;
    let mediaFallbackLevel = shotList.fallbackLevel;
    const mediaFallbackWarnings = [...shotList.warnings];
    const hydration = await hydrateMediaSegmentsForRender(platform, mediaSegments);
    mediaSegments = hydration.segments;
    mediaFallbackWarnings.push(...hydration.warnings);
    if (shotList.segments.length > 0 && mediaSegments.length === 0) {
      mediaFallbackWarnings.push("fallback-reached-generated-only-stage");
      mediaFallbackLevel = "generated-only";
    }
    const mediaAssets = mediaSegments.length > 0
      ? mediaSegments.map((segment) => segment.asset)
      : normalizeVideoAssetManifest({ assets: existingPlatformTracker?.mediaAssets || [] }).assets
        .filter(isLocalVideoAssetAvailable);
    const mediaSelectedAt = new Date().toISOString();
    for (const segment of mediaSegments) {
      mediaUsageRecords.push({
        assetId: segment.asset.id,
        platform,
        usedAt: mediaSelectedAt,
        segmentId: segment.segmentId,
      });
    }
    const mediaStage: VideoMediaStage = existingPlatformTracker?.mediaStage || "primary";
    const tiktokScenePlan = existingPlatformTracker?.tiktokScenePlan ||
      (platform === "tiktok"
        ? buildTikTokInVideoScenePlan({
          tokenName: targetToken.name,
          symbol: targetToken.symbol,
          priceChange24h: targetToken.market.priceChange24h,
          riskScore: targetMetric?.riskScore || 5.0,
          volume24h: targetToken.market.volume24h,
          contextText: context.trendingContext,
          videoThesis,
          durationSeconds: renderProfile.durationSeconds,
          seedParts: [today, platform, targetToken.id, videoFormat.key, visualRecipe.key, reason],
        })
        : undefined);
    const outputPath = path.join(outputDir, `tokenradar-${today}-shared.mp4`);
    const propsFile = path.join(outputDir, "remotion-props-shared.json");

    console.log(`  shared render (${platform}) for ${requestedPlatforms.join(", ")}: ${videoFormat.label} (${videoFormat.key})`);
    if (!force && usedVideoFormatKeys.has(videoFormat.key) && !existingPlatformTracker?.formatKey) {
      console.warn(`  shared render: format cooldown pool was exhausted; selected from the full format library.`);
    }
    if (!force && usedVideoRecipeKeys.has(visualRecipe.key) && !existingPlatformTracker?.visualRecipe) {
      console.warn(`  shared render: visual recipe cooldown pool was exhausted; selected from the full recipe library.`);
    }
    console.log(`  shared render: recipe ${visualRecipe.key}`);
    console.log(`  shared render: ${audioTrack.file} (start: ${audioTrack.startSeconds}s)`);
    if (voiceoverResult.status === "generated") {
      console.log(`  shared render: Kokoro voiceover ${voiceoverResult.fileName}`);
    } else if (voiceoverResult.status === "failed") {
      console.warn(`  shared render: Kokoro voiceover skipped after failure: ${voiceoverResult.error}`);
    } else {
      console.warn(`  shared render: Kokoro voiceover disabled or empty.`);
    }
    if (mediaSegments.length > 0) {
      console.log(
        `  shared render: media ${mediaSegments.map((segment) => `${segment.segmentId}:${segment.asset.id}@${segment.startOffsetSeconds}s`).join(", ")}`,
      );
    } else if (mediaAssets.length > 0) {
      console.log(`  shared render: media ${mediaAssets.map((asset) => asset.id).join(", ")}`);
    }
    for (const warning of mediaFallbackWarnings) {
      console.warn(`  shared render: media fallback ${warning}`);
    }

    const videoProps = {
      tokenName: targetToken.name,
      symbol: targetToken.symbol.toUpperCase(),
      price: targetToken.market.price,
      priceChange24h: targetToken.market.priceChange24h,
      riskScore: targetMetric?.riskScore || 5.0,
      riskLevel: targetMetric?.riskLevel,
      marketCap: targetToken.market.marketCap,
      marketCapRank: targetToken.market.marketCapRank,
      volume24h: targetToken.market.volume24h,
      growthPotentialIndex: targetMetric?.growthPotentialIndex,
      audioFile: audioTrack.file,
      audioStartSeconds: audioTrack.startSeconds,
      voiceoverFile: voiceoverResult.fileName,
      voiceoverScript,
      hookText,
      contextText: context.trendingContext || "Strong social sentiment and increasing volume are driving this breakout.",
      videoFormatKey: videoFormat.key,
      videoThesis,
      visualRecipe,
      mediaAssets,
      mediaSegments,
      mediaStage,
      tiktokScenePlan,
      verdict,
    };

    fs.writeFileSync(propsFile, JSON.stringify(videoProps));
    try {
      execFileSync(
        process.execPath,
        [
          getRemotionCliPath(),
          "render",
          "src/video/index.tsx",
          renderProfile.compositionId,
          outputPath,
          `--props=${propsFile}`,
        ],
        { stdio: "inherit" },
      );
    } finally {
      cleanupFile(propsFile);
    }
    validateRenderedVideoOutput(outputPath, platform);

    const sharedVideoAsset: PlatformVideoAsset = {
      platform,
      outputPath,
      buffer: fs.readFileSync(outputPath),
      format: videoFormat,
      videoThesis,
      hookText,
      audioTrack,
      voiceoverScript,
      voiceoverFile: voiceoverResult.fileName,
      voiceoverOutputPath: voiceoverResult.outputPath,
      voiceoverProvider: voiceoverResult.provider,
      voiceoverStatus: voiceoverResult.status,
      voiceoverError: voiceoverResult.error,
      visualRecipe,
      mediaAssets,
      mediaSegments,
      mediaFallbackLevel,
      mediaFallbackWarnings,
      mediaStage,
      tiktokScenePlan,
    };

    for (const publishPlatform of requestedPlatforms) {
      platformVideos.set(publishPlatform, cloneVideoAssetForPlatform(sharedVideoAsset, publishPlatform));
    }
    console.log(`  shared render: rendered ${outputPath}`);
  } catch (error) {
    console.error(`  Video rendering failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  }

  // ── R2 Upload for Meta platforms ──
  let igVideoUrl = "";
  let threadsVideoUrl = "";
  let igVideoKey = "";
  let threadsVideoKey = "";

  if (dryRun) {
    igVideoUrl = platformVideos.get("instagram")?.outputPath || "";
    threadsVideoUrl = platformVideos.get("threads")?.outputPath || "";
  } else if (shouldRunInstagram || shouldRunThreads) {
    console.log();
    console.log("Step 3b: Staging videos to R2 for Meta APIs...");
    try {
      const videoPrefix = `video/${today}/`;
      await cleanPrefix(videoPrefix);
      if (shouldRunInstagram) {
        igVideoKey = `${videoPrefix}instagram.mp4`;
        igVideoUrl = await uploadToR2(getPlatformVideoAsset(platformVideos, "instagram").outputPath, igVideoKey);
      }
      if (shouldRunThreads) {
        threadsVideoKey = `${videoPrefix}threads.mp4`;
        threadsVideoUrl = await uploadToR2(getPlatformVideoAsset(platformVideos, "threads").outputPath, threadsVideoKey);
      }
    } catch (r2Error) {
      console.error(`  R2 staging failed: ${formatErrorForLog(r2Error)}`);
      console.warn("  Continuing without Meta platforms.");
      igVideoUrl = "";
      threadsVideoUrl = "";
      igVideoKey = "";
      threadsVideoKey = "";
    }
  }

  try {
    let tgMessage = "";
    let xMessage = "";
    let xReplyMessage = "";
    let ytMetadata = { title: "", description: "" };
    let igContent = { caption: "", hashtags: [] as string[] };
    let threadsContent = { caption: "", topicTag: "crypto", spoilerText: "", spoilerOffset: 0, spoilerLength: 0 };
    let tiktokCaption = "";

    console.log();
    console.log("Step 4: Generating platform captions...");

    const captionPlatforms: PlatformTarget[] = [];
    const captionOptions: UnifiedCaptionOptions = {
      editorialFormat: {
        label: "Platform-specific video formats",
        angle: "each platform receives its own visual format while keeping the same fast TokenRadar tone",
        promptInstruction: "Match each platform caption to its rendered video format:\n" +
          buildPlatformFormatPrompt(platformVideos, requestedPlatforms),
        captionInstruction: "Do not write one generic caption for every platform; mirror the named format for that platform.",
      },
    };

    if (runTelegram) {
      captionOptions.telegramMaxChars = SOCIAL_PLATFORM_LIMITS.TELEGRAM.VIDEO_AI_SUMMARY_CHARS;
      captionPlatforms.push("telegram");
    }

    if (runX) {
      captionOptions.xMaxChars = 260;
      captionPlatforms.push("x");
      const isOnWebsite = onWebsiteIds.has(targetToken.id);
      xReplyMessage = includeLinkReply
        ? isOnWebsite
          ? `Read the $${targetToken.symbol.toUpperCase()} deep-dive and find all TokenRadar links here:\n\n${SOCIAL.ecosystemUrl}`
          : `Discover 300+ tracked and upcoming tokens through TokenRadar links:\n\n${SOCIAL.ecosystemUrl}`
        : "";
    }

    if (shouldRunYouTube) {
      captionPlatforms.push("youtube");
    }

    if (shouldRunInstagram && igVideoUrl) {
      captionOptions.instagramMaxChars = SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT;
      captionPlatforms.push("instagram");
    }

    if (shouldRunThreads && threadsVideoUrl) {
      captionOptions.threadsMaxChars = SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT;
      captionPlatforms.push("threads");
    }

    if (shouldRunTikTok) {
      captionOptions.tiktokMaxChars = SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT;
      captionPlatforms.push("tiktok");
    }

    if (captionPlatforms.length > 0) {
      const captions = await generateUnifiedCaptions(
        targetToken.name,
        targetToken.symbol,
        targetToken.description || "",
        context,
        captionPlatforms,
        captionOptions,
      );

      if (runTelegram) tgMessage = captions.telegramSummary || "";
      if (runX) xMessage = captions.xTweet || "";
      if (shouldRunYouTube) {
        ytMetadata = {
          title: captions.youtubeTitle || "",
          description: captions.youtubeDescription || "",
        };
      }
      if (shouldRunInstagram && igVideoUrl) {
        igContent = extractInstagramContent(captions.instagramCaption);
      }
      if (shouldRunThreads && threadsVideoUrl) {
        threadsContent = buildThreadsContent(
          captions.threadsCaption,
          captions.threadsTopicTag,
          captions.threadsSpoilerText,
          targetToken.name,
        );
      }
      if (shouldRunTikTok) {
        tiktokCaption = captions.tiktokCaption || "";
      }
    }

    if (runX && xMessage) {
      const recentXTexts = getRecentPlatformTexts(DATA_DIR, "x", 14);
      const diversified = diversifyXPostText(
        xMessage,
        recentXTexts,
        `${today}:${targetToken.id}:${reason}:video`,
        captionOptions.xMaxChars ?? 260,
      );
      if (diversified !== xMessage) {
        console.log("Adjusted X video copy to avoid repeating recent post structure.");
        xMessage = diversified;
      }
    }

    if (shouldRunYouTube && ytMetadata.description) {
      ytMetadata = {
        ...ytMetadata,
        description: ensureRiskDisclaimer(ytMetadata.description),
      };
    }
    if (shouldRunTikTok && tiktokCaption) {
      tiktokCaption = normalizeTikTokCaption(ensureTikTokResearchContextNote(tiktokCaption));
    }

    const copyValidation = [
      runTelegram
        ? { platform: "telegram" as const, caption: buildTelegramMediaCaption(tgMessage, getTelegramFooter(targetToken.symbol), {
          maxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT,
          bodyMaxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.VIDEO_AI_SUMMARY_CHARS,
        }) }
        : null,
      runX ? { platform: "x" as const, caption: xMessage } : null,
      shouldRunYouTube
        ? { platform: "youtube" as const, title: ytMetadata.title, description: ytMetadata.description }
        : null,
      shouldRunInstagram && igVideoUrl
        ? { platform: "instagram" as const, caption: igContent.caption }
        : null,
      shouldRunThreads && threadsVideoUrl
        ? { platform: "threads" as const, caption: threadsContent.caption, topicTag: threadsContent.topicTag }
        : null,
      shouldRunTikTok
        ? {
          platform: "tiktok" as const,
          caption: tiktokCaption,
          privacyLevel: shouldRunTikTokDirect ? process.env.TIKTOK_PRIVACY_LEVEL || "PUBLIC_TO_EVERYONE" : undefined,
        }
        : null,
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));

    for (const copyPackage of copyValidation) {
      const result = validatePlatformCopyPackage(copyPackage);
      if (!result.ok) {
        failWithVideoAlert(
          "platformPublishFailed",
          today,
          targetPlatform,
          `${copyPackage.platform} copy validation failed: ${result.issues.join(", ")}`,
          copyPackage.platform,
        );
      }
    }

    if (dryRun) {
      console.log();
      console.log("=== DRY RUN MODE ===");
      console.log();
      console.log("--- LOCAL VIDEO OUTPUTS ---");
      for (const platform of requestedPlatforms) {
        const asset = getPlatformVideoAsset(platformVideos, platform);
        console.log(`${platform}: ${asset.outputPath}`);
        console.log(`  format: ${asset.format.label} (${asset.format.key})`);
        console.log(`  recipe: ${asset.visualRecipe.key}`);
        console.log(
          `  media: ${
            asset.mediaSegments.length > 0
              ? asset.mediaSegments.map((segment) => `${segment.segmentId}:${segment.asset.id}@${segment.startOffsetSeconds}s`).join(", ")
              : asset.mediaAssets.map((mediaAsset) => mediaAsset.id).join(", ") || "generated motion graphics only"
          }`,
        );
        console.log(`  media fallback: ${asset.mediaFallbackLevel}`);
      }
      if (runTelegram) {
        console.log();
        console.log("--- TELEGRAM CAPTION ---");
        console.log(tgMessage);
      }
      if (runX) {
        console.log();
        console.log("--- X MAIN TWEET (with platform video) ---");
        console.log(xMessage);
      }
      if (shouldRunYouTube) {
        console.log();
        console.log("--- YOUTUBE SHORTS ---");
        console.log(`TITLE: ${ytMetadata.title}`);
        console.log(`DESC:\n${ytMetadata.description}`);
      }
      if (shouldRunInstagram) {
        console.log();
        console.log("--- INSTAGRAM REEL ---");
        console.log(`R2 URL: ${igVideoUrl}`);
        console.log(`CAPTION (${igContent.caption.length} chars):`);
        console.log(igContent.caption);
        console.log(`HASHTAGS: ${igContent.hashtags.join(", ")}`);
      }
      if (shouldRunThreads) {
        console.log();
        console.log("--- THREADS POST ---");
        console.log(`R2 URL: ${threadsVideoUrl}`);
        console.log(`CAPTION (${threadsContent.caption.length} chars):`);
        console.log(threadsContent.caption);
        console.log(`TOPIC: ${threadsContent.topicTag}`);
        console.log(`SPOILER: "${threadsContent.spoilerText}" (offset: ${threadsContent.spoilerOffset}, length: ${threadsContent.spoilerLength})`);
      }
      if (shouldRunTikTok) {
        console.log();
        console.log(
          shouldRunTikTokDirect
            ? "--- TIKTOK DIRECT POST ---"
            : shouldRunTikTokInbox
              ? "--- TIKTOK API UPLOAD ---"
              : "--- TIKTOK MANUAL REPORT ---",
        );
        console.log(`CAPTION (${tiktokCaption.length}/${SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT} chars):`);
        console.log(tiktokCaption);
        if (shouldRunTikTokDirect) {
          console.log("DELIVERY: TikTok Content Posting API direct post with video.publish scope.");
          console.log("NOTE: The caption is sent to TikTok as post_info.title.");
        } else if (shouldRunTikTokInbox) {
          console.log("DELIVERY: TikTok Content Posting API inbox upload with video.upload scope.");
          console.log(
            hasTikTokReportCredentials
              ? "NOTE: TikTok upload-to-inbox receives the MP4; the copy-ready caption is sent to the Telegram reporting chat."
              : "NOTE: TikTok upload-to-inbox receives the MP4; missing Telegram reporting credentials, so the caption is stored in the tracker only.",
          );
        } else {
          console.log("DELIVERY: Telegram reporting dialog with video attachment and copy-ready caption.");
        }
      }
      return;
    }

    if (platformVideos.size === 0) {
      throw new Error("No rendered video assets were available for publishing.");
    }

    const trackerState: VideoTracker = {
      postedAt: existingTracker?.postedAt || new Date().toISOString(),
      tokenId: targetToken.id,
      tokenName: targetToken.name,
      reason,
      platform: targetPlatform,
      platforms: { ...(existingTracker?.platforms || {}) },
    };
    const trackerContext = {
      date: today,
      tokenId: targetToken.id,
      forceId: force ? process.env.GITHUB_RUN_ATTEMPT || process.env.GITHUB_RUN_ID || String(Date.now()) : undefined,
    };
    const trackerFields = (asset: PlatformVideoAsset) => getPlatformTrackerFields(asset, trackerContext);
    const failedTracker = (error: unknown, asset?: PlatformVideoAsset): PlatformTracker => {
      const classification = classifyVideoPublishError(error);
      return {
        postedAt: new Date().toISOString(),
        status: classification.status,
        publishError: classification.diagnostic,
        publishFailureClass: classification.failureClass,
        publishRetryable: classification.retryable,
        ...(asset ? trackerFields(asset) : {}),
      };
    };

    for (const platform of d1AlreadyPublished) {
      if (!trackerState.platforms[platform]) {
        trackerState.platforms[platform] = {
          postedAt: existingTracker?.postedAt || new Date().toISOString(),
          status: "published",
        };
      }
    }
    for (const platform of skippedByMissingCredentials) {
      if (!trackerState.platforms[platform]) {
        trackerState.platforms[platform] = {
          postedAt: new Date().toISOString(),
          status: "skipped_by_missing_credentials",
          publishError: "Platform credentials or required staging/reporting credentials were not configured.",
        };
      }
    }

    const publishTasks: Array<Promise<{ platform: PlatformName; tracker: PlatformTracker | null }>> = [];

    if (runTelegram && !trackerState.platforms.telegram) {
      publishTasks.push(
        (async () => {
          try {
            const telegramAsset = getPlatformVideoAsset(platformVideos, "telegram");
            const tgFooter = getTelegramFooter(targetToken.symbol);
            const caption = buildTelegramMediaCaption(tgMessage, tgFooter, {
              maxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT,
              bodyMaxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.VIDEO_AI_SUMMARY_CHARS,
            });

            const msgId = await sendTelegramVideo(telegramAsset.buffer, caption, channelId as string);
            console.log(`Posted video to Telegram (Message ID: ${msgId})`);
            return {
              platform: "telegram" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                status: "published",
                messageId: msgId,
                caption,
                ...trackerFields(telegramAsset),
              },
            };
          } catch (error) {
            await logError("post-video-daily-telegram", error, false);
            console.error(`Telegram video post failed: ${formatErrorForLog(error)}`);
            return { platform: "telegram" as const, tracker: failedTracker(error, platformVideos.get("telegram")) };
          }
        })(),
      );
    }

    if (runX && !trackerState.platforms.x) {
      publishTasks.push(
        (async () => {
          try {
            const xAsset = getPlatformVideoAsset(platformVideos, "x");
            const tweetId = await postTweetWithMedia(xMessage, xAsset.buffer, "video/mp4");
            console.log(`Posted tweet with video to X (Tweet ID: ${tweetId})`);

            let replyId: string | undefined;
            if (xReplyMessage) {
              try {
                replyId = await postTweet(xReplyMessage, tweetId);
                console.log(`Posted reply to X (Reply ID: ${replyId})`);
              } catch (replyError) {
                await logError("post-video-daily-x-reply", replyError, false);
                console.warn(`Main video tweet succeeded, but the follow-up reply failed: ${formatErrorForLog(replyError)}`);
              }
            }

            return {
              platform: "x" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                status: "published",
                tweetId,
                replyId,
                xText: xMessage,
                ...trackerFields(xAsset),
              },
            };
          } catch (error) {
            await logError("post-video-daily-x", error, false);
            console.error(`X video post failed: ${formatErrorForLog(error)}`);
            return { platform: "x" as const, tracker: failedTracker(error, platformVideos.get("x")) };
          }
        })(),
      );
    }

    if (shouldRunYouTube && !trackerState.platforms.youtube) {
      publishTasks.push(
        (async () => {
          try {
            const youtubeAsset = getPlatformVideoAsset(platformVideos, "youtube");
            const publishAt = new Date();
            publishAt.setMinutes(publishAt.getMinutes() + 15);
            
            console.log(`Starting YouTube upload (scheduled for ${publishAt.toISOString()})...`);
            const videoId = await uploadToYouTubeShorts(
              youtubeAsset.outputPath,
              ytMetadata.title,
              ytMetadata.description,
              "private",
              publishAt
            );
            console.log(`Posted video to YouTube Shorts (Video ID: ${videoId})`);
            return {
              platform: "youtube" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                status: "published",
                videoId,
                youtubeTitle: ytMetadata.title,
                youtubeDescription: ytMetadata.description,
                ...trackerFields(youtubeAsset),
              },
            };
          } catch (error) {
            await logError("post-video-daily-youtube", error, false);
            console.error(`YouTube video post failed: ${formatErrorForLog(error)}`);
            return { platform: "youtube" as const, tracker: failedTracker(error, platformVideos.get("youtube")) };
          }
        })(),
      );
    }

    // ── Instagram Reel ──
    if (shouldRunInstagram && igVideoUrl && !trackerState.platforms.instagram) {
      publishTasks.push(
        (async () => {
          try {
            const instagramAsset = getPlatformVideoAsset(platformVideos, "instagram");
            const result = await publishMetaVideo("instagram", igVideoUrl, igContent.caption, {
              thumbOffset: 3000,
            });
            console.log(`Posted Reel to Instagram (Post ID: ${result.id})`);
            return {
              platform: "instagram" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                status: "published",
                postId: result.id,
                caption: igContent.caption,
                ...trackerFields(instagramAsset),
              },
            };
          } catch (error) {
            await logError("post-video-daily-instagram", error, false);
            console.error(`Instagram Reel post failed: ${formatErrorForLog(error)}`);
            return { platform: "instagram" as const, tracker: failedTracker(error, platformVideos.get("instagram")) };
          }
        })(),
      );
    }

    // ── Threads Post ──
    if (shouldRunThreads && threadsVideoUrl && !trackerState.platforms.threads) {
      publishTasks.push(
        (async () => {
          try {
            const threadsAsset = getPlatformVideoAsset(platformVideos, "threads");
            const spoilerEntities: TextEntity[] = threadsContent.spoilerLength > 0
              ? [{ entity_type: "SPOILER", offset: threadsContent.spoilerOffset, length: threadsContent.spoilerLength }]
              : [];

            const result = await publishMetaVideo("threads", threadsVideoUrl, threadsContent.caption, {
              topicTag: threadsContent.topicTag,
              spoilerEntities,
            });
            console.log(`Posted video to Threads (Post ID: ${result.id})`);
            return {
              platform: "threads" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                status: "published",
                postId: result.id,
                caption: threadsContent.caption,
                ...trackerFields(threadsAsset),
              },
            };
          } catch (error) {
            await logError("post-video-daily-threads", error, false);
            console.error(`Threads video post failed: ${formatErrorForLog(error)}`);
            return { platform: "threads" as const, tracker: failedTracker(error, platformVideos.get("threads")) };
          }
        })(),
      );
    }

    if (shouldRunTikTokDirect && !trackerState.platforms.tiktok) {
      publishTasks.push(
        (async () => {
          try {
            const tiktokAsset = getPlatformVideoAsset(platformVideos, "tiktok");
            const safeTikTokCaption = normalizeTikTokCaption(tiktokCaption);
            const result = await publishVideoDirectlyToTikTok({
              videoPath: tiktokAsset.outputPath,
              caption: safeTikTokCaption,
            });
            console.log(`Posted video directly to TikTok (Publish ID: ${result.publishId})`);
            return {
              platform: "tiktok" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                status: "published",
                publishId: result.publishId,
                tiktokStatus: result.status?.status,
                tiktokFailReason: result.status?.fail_reason,
                tiktokCaption: safeTikTokCaption,
                tiktokPrivacyLevel: result.privacyLevel,
                tiktokCreatorUsername: result.creatorInfo?.creator_username,
                deliveryMode: "content-posting-api-direct" as const,
                ...trackerFields(tiktokAsset),
              },
            };
          } catch (error) {
            await logError("post-video-daily-tiktok-direct", error, false);
            console.error(`TikTok direct post failed: ${formatErrorForLog(error)}`);
            return { platform: "tiktok" as const, tracker: failedTracker(error, platformVideos.get("tiktok")) };
          }
        })(),
      );
    }

    if (shouldRunTikTokInbox && !trackerState.platforms.tiktok) {
      publishTasks.push(
        (async () => {
          try {
            const tiktokAsset = getPlatformVideoAsset(platformVideos, "tiktok");
            const safeTikTokCaption = normalizeTikTokCaption(tiktokCaption);
            const result = await uploadVideoToTikTokInbox({
              videoPath: tiktokAsset.outputPath,
            });
            console.log(`Uploaded video to TikTok inbox (Publish ID: ${result.publishId})`);

            let reportSummaryMessageId: number | undefined;
            let reportCaptionMessageIds: number[] | undefined;
            if (hasTikTokReportCredentials) {
              try {
                const report = await sendTikTokInboxUploadReport({
                  caption: safeTikTokCaption,
                  tokenName: targetToken.name,
                  symbol: targetToken.symbol,
                  publishId: result.publishId,
                  status: result.status?.status,
                  failReason: result.status?.fail_reason,
                  reason,
                  generatedAt: new Date().toISOString(),
                });
                reportSummaryMessageId = report.summaryMessageId;
                reportCaptionMessageIds = report.captionMessageIds;
                console.log(
                  `Sent TikTok inbox caption to reporting dialog (Summary Message ID: ${report.summaryMessageId})`,
                );
              } catch (reportError) {
                await logError("post-video-daily-tiktok-api-report", reportError, false);
                console.error(`TikTok inbox Telegram report failed: ${formatErrorForLog(reportError)}`);
              }
            } else {
              console.warn("  Missing Telegram reporting credentials. TikTok caption stored in tracker only.");
            }

            return {
              platform: "tiktok" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                status: reportSummaryMessageId ? "manual_handoff_sent" : "uploaded",
                publishId: result.publishId,
                tiktokStatus: result.status?.status,
                tiktokFailReason: result.status?.fail_reason,
                tiktokCaption: safeTikTokCaption,
                reportSummaryMessageId,
                reportCaptionMessageIds,
                deliveryMode: "content-posting-api-inbox" as const,
                ...trackerFields(tiktokAsset),
              },
            };
          } catch (error) {
            await logError("post-video-daily-tiktok-api", error, false);
            console.error(`TikTok API upload failed: ${formatErrorForLog(error)}`);
            return { platform: "tiktok" as const, tracker: failedTracker(error, platformVideos.get("tiktok")) };
          }
        })(),
      );
    }

    if (shouldRunTikTokManual && !trackerState.platforms.tiktok) {
      publishTasks.push(
        (async () => {
          try {
            const tiktokAsset = getPlatformVideoAsset(platformVideos, "tiktok");
            const result = await sendTikTokManualPostReport({
              videoBuffer: tiktokAsset.buffer,
              caption: tiktokCaption,
              tokenName: targetToken.name,
              symbol: targetToken.symbol,
              reason,
              generatedAt: new Date().toISOString(),
            });
            console.log(
              `Sent TikTok manual package to reporting dialog (Video Message ID: ${result.videoMessageId})`,
            );
            return {
              platform: "tiktok" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                status: "manual_handoff_sent",
                reportVideoMessageId: result.videoMessageId,
                reportCaptionMessageIds: result.captionMessageIds,
                tiktokCaption,
                deliveryMode: "telegram-report-manual" as const,
                ...trackerFields(tiktokAsset),
              },
            };
          } catch (error) {
            await logError("post-video-daily-tiktok-manual", error, false);
            console.error(`TikTok manual report failed: ${formatErrorForLog(error)}`);
            return { platform: "tiktok" as const, tracker: failedTracker(error, platformVideos.get("tiktok")) };
          }
        })(),
      );
    }

    const results = await Promise.all(publishTasks);
    for (const result of results) {
      if (result.tracker) {
        trackerState.platforms[result.platform] = result.tracker;
        if (shouldRecordPublishedSocialPost(result.tracker)) {
          await recordSocialPost({
            platform: result.platform,
            contentKey: getVideoSocialPostKey(today, targetToken.id, result.platform),
            externalId: getPlatformTrackerExternalId(result.tracker),
            postedAt: result.tracker.postedAt,
            details: {
              tokenId: targetToken.id,
              tokenName: targetToken.name,
              reason,
              requestedPlatform: targetPlatform,
              status: result.tracker.status,
              formatKey: result.tracker.formatKey,
              formatLabel: result.tracker.formatLabel,
              visualRecipeKey: result.tracker.visualRecipeKey,
              mediaAssetIds: result.tracker.mediaAssetIds,
              deliveryMode: result.tracker.deliveryMode,
              variantSurface: "video",
            },
          });
        }
      }
    }

    const stagedKeysToDelete = [
      trackerState.platforms.instagram ? igVideoKey : "",
      trackerState.platforms.threads ? threadsVideoKey : "",
    ].filter(Boolean);

    if (stagedKeysToDelete.length > 0) {
      try {
        await deleteObjects(stagedKeysToDelete);
      } catch (cleanupError) {
        console.warn(`  R2 staged video cleanup failed: ${formatErrorForLog(cleanupError)}`);
      }
    }

    const remainingPlatforms = requestedPlatforms.filter((platform) => !isPlatformCompleteForRun(trackerState.platforms[platform]));
    if (remainingPlatforms.length > 0) {
      trackerState.postedAt = new Date().toISOString();
      fs.writeFileSync(trackerFile, JSON.stringify(trackerState, null, 2));
      await recordAutomationRun({
        id: videoAutomationRunId,
        workflow: "post-video-daily",
        slot: targetPlatform,
        status: "failed",
        finishedAt: new Date().toISOString(),
        details: {
          tokenId: targetToken.id,
          tokenName: targetToken.name,
          remainingPlatforms,
          requestedPlatforms,
        },
      });
      throw new Error(`Failed to publish daily video to: ${remainingPlatforms.join(", ")}`);
    }

    trackerState.postedAt = new Date().toISOString();
    fs.writeFileSync(trackerFile, JSON.stringify(trackerState, null, 2));
    await recordAutomationRun({
      id: videoAutomationRunId,
      workflow: "post-video-daily",
      slot: targetPlatform,
      status: "success",
      finishedAt: trackerState.postedAt,
      details: {
        tokenId: targetToken.id,
        tokenName: targetToken.name,
        requestedPlatforms,
        skippedByMissingCredentials,
      },
    });
  } finally {
    if (!keepOutput) {
      for (const asset of platformVideos.values()) {
        cleanupFile(asset.outputPath);
        if (asset.voiceoverOutputPath) cleanupFile(asset.voiceoverOutputPath);
      }
    }
  }
}

function isDirectExecution(): boolean {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  main().catch(async (error) => {
    await logError("post-video-daily", error);
    process.exit(1);
  });
}
