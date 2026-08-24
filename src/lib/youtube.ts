import { google } from 'googleapis';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { sanitizePostTextLinks } from './social-link-policy';
import { buildVideoCaptionCues } from './video-captioning';
import {
  buildVideoEvidenceSummary,
  formatVideoAsOf,
  formatVideoMarketSource,
  type VideoEvidenceInput,
} from './video-evidence';

type GoogleApiError = Error & {
  response?: {
    status?: number;
    data?: {
      error?: {
        message?: string;
        details?: unknown;
      };
    };
  };
};

export class YouTubeUploadOutcomeUnknownError extends Error {
  override readonly cause: unknown;

  constructor(cause: unknown) {
    super('YouTube upload outcome is unknown; reconcile the channel before retrying.');
    this.name = 'YouTubeUploadOutcomeUnknownError';
    this.cause = cause;
  }
}

export function isYouTubeUploadOutcomeUnknownError(error: unknown): error is YouTubeUploadOutcomeUnknownError {
  return error instanceof YouTubeUploadOutcomeUnknownError;
}

function toGoogleApiError(error: unknown): GoogleApiError {
  return error instanceof Error ? error as GoogleApiError : new Error(String(error)) as GoogleApiError;
}

export interface YouTubeCaptionTrack {
  text: string;
  durationSeconds: number;
  language?: string;
  name?: string;
}

export interface YouTubeShortsMetadataInput extends VideoEvidenceInput {
  generatedTitle?: string;
  generatedDescription?: string;
  researchUrl?: string;
  formatLabel?: string;
}

export interface YouTubeShortsMetadata {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
}

export interface YouTubeShortsUploadMetadata {
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;
}

function formatVttTimestamp(totalSeconds: number): string {
  const totalMilliseconds = Math.round(Math.max(0, totalSeconds) * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

/** Build a readable, deterministically timed caption track from narration text. */
export function buildWebVttCaptionTrack(text: string, durationSeconds: number): string {
  const cues = buildVideoCaptionCues(text, durationSeconds, 7);
  if (cues.length === 0) return 'WEBVTT\n';
  const renderedCues = cues.map((cue) =>
    `${cue.index}\n${formatVttTimestamp(cue.startSeconds)} --> ${formatVttTimestamp(cue.endSeconds)}\n${cue.text}`,
  );
  return `WEBVTT\n\n${renderedCues.join('\n\n')}\n`;
}

function uniqueYouTubeTags(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = value?.replace(/^#+/, '').replace(/[^a-z0-9 ._+-]/gi, '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean.slice(0, 30));
  }
  return output.slice(0, 8);
}

/** Build grounded, searchable Shorts packaging without relying on a generic AI title. */
export function buildYouTubeShortsMetadata(input: YouTubeShortsMetadataInput): YouTubeShortsMetadata {
  const evidence = buildVideoEvidenceSummary(input);
  const tokenName = input.tokenName.trim();
  const move = evidence.moveLabel?.replace(' / 24H', '');
  const titleBase = move
    ? `${tokenName} (${evidence.tokenLabel}) ${move}: Risk Check`
    : `${tokenName} (${evidence.tokenLabel}): Market Data Check`;
  const title = titleBase.length <= 60
    ? titleBase
    : `${evidence.tokenLabel}${move ? ` ${move}` : ''}: Market Data Check`.slice(0, 60).trim();

  const evidenceParts = [
    evidence.moveLabel ? `${evidence.tokenLabel} ${evidence.moveLabel.replace(' / 24H', '')} over 24h` : undefined,
    evidence.turnoverLabel ? `reported turnover ${evidence.turnoverLabel.replace(' VOL/CAP', ' of market cap')}` : undefined,
    evidence.riskLabel ? `TokenRadar risk score ${evidence.riskLabel.replace(' RISK', '')}` : undefined,
  ].filter((value): value is string => Boolean(value));
  const source = formatVideoMarketSource(input.marketDataSource);
  const asOf = formatVideoAsOf(input.marketDataAsOf);
  const sourceLine = source && asOf
    ? `Source: ${source} · Data as of ${asOf}`
    : source
      ? `Source: ${source}`
      : asOf
        ? `Data as of ${asOf}`
        : undefined;
  const researchLine = input.researchUrl?.trim() ? `Research: ${input.researchUrl.trim()}` : undefined;
  const description = [
    evidenceParts.length > 0 ? `${evidenceParts.join(' · ')}.` : input.generatedDescription?.trim(),
    sourceLine,
    'Educational market context. Point-in-time data, not financial advice.',
    researchLine,
    `#Shorts #Crypto #${evidence.tokenLabel.replace(/[^A-Z0-9_]/g, '') || 'TokenRadar'}`,
  ].filter(Boolean).join('\n\n');

  return {
    title: sanitizePostTextLinks(title),
    description: sanitizePostTextLinks(description),
    tags: uniqueYouTubeTags([
      tokenName,
      evidence.tokenLabel,
      `${evidence.tokenLabel} crypto`,
      'crypto market data',
      'TokenRadar',
      input.formatLabel,
      'YouTube Shorts',
    ]),
    categoryId: '28',
  };
}

/**
 * Uploads a local MP4 file to YouTube as a Short.
 * Requires YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN in .env
 *
 * @param videoPath - Absolute path to the MP4 file
 * @param title - The YouTube video title (Max 60 chars recommended)
 * @param description - The description including #Shorts
 * @param privacyStatus - "public", "unlisted", or "private"
 * @returns The YouTube Video ID
 */
export async function uploadToYouTubeShorts(
  videoPath: string,
  title: string,
  description: string,
  privacyStatus: 'public' | 'unlisted' | 'private' = 'public',
  publishAt?: Date,
  captionTrack?: YouTubeCaptionTrack,
  uploadMetadata?: YouTubeShortsUploadMetadata,
): Promise<string> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing YouTube OAuth credentials in .env.local (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3000');
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({
    version: 'v3',
    auth: oauth2Client
  });

  const fileSize = fs.statSync(videoPath).size;

  try {
    // Resolve/refresh OAuth before entering the non-idempotent insert call so
    // an authentication outage cannot be mistaken for an accepted upload.
    await oauth2Client.getAccessToken();
    const safeTitle = sanitizePostTextLinks(title) || 'TokenRadar Market Update';
    const safeDescription = sanitizePostTextLinks(description);

    console.info(`  ▸ Starting YouTube upload (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);
    let res;
    try {
      res = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: safeTitle,
            description: safeDescription,
            categoryId: uploadMetadata?.categoryId || '28',
            tags: uploadMetadata?.tags?.length ? uploadMetadata.tags : undefined,
            defaultLanguage: uploadMetadata?.defaultLanguage || 'en',
            defaultAudioLanguage: captionTrack?.language || uploadMetadata?.defaultLanguage || 'en',
          },
          status: {
            privacyStatus: publishAt ? 'private' : privacyStatus,
            publishAt: publishAt ? publishAt.toISOString() : undefined,
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: fs.createReadStream(videoPath),
        },
      }, {
        // Use the media upload endpoint for large files
        onUploadProgress: evt => {
          const progress = (evt.bytesRead / fileSize) * 100;
          process.stdout.write(`\r  [YouTube] Uploading... ${Math.round(progress)}%`);
        },
      });
    } catch (insertError) {
      const apiError = toGoogleApiError(insertError);
      const status = apiError.response?.status;
      if (status === 408 || (status !== undefined && status >= 500) || /(?:timeout|timed out|econnreset|fetch failed|network error|socket hang up)/i.test(apiError.message)) {
        throw new YouTubeUploadOutcomeUnknownError(insertError);
      }
      throw insertError;
    }

    console.info();
    if (res.data && res.data.id) {
      const videoId = res.data.id;
      console.info(`  ✓ YouTube upload complete! Video ID: ${videoId}`);

      if (captionTrack?.text.trim()) {
        const captionPath = path.join(os.tmpdir(), `tokenradar-${videoId}-${Date.now()}.vtt`);
        try {
          fs.writeFileSync(
            captionPath,
            buildWebVttCaptionTrack(captionTrack.text, captionTrack.durationSeconds),
            'utf8',
          );
          await youtube.captions.insert({
            part: ['snippet'],
            requestBody: {
              snippet: {
                videoId,
                language: captionTrack.language || 'en',
                name: captionTrack.name || 'English',
                isDraft: false,
              },
            },
            media: {
              mimeType: 'text/vtt',
              body: fs.createReadStream(captionPath),
            },
          });
          console.info(`  ✓ YouTube caption track uploaded for ${videoId}.`);
        } catch (captionError) {
          // The video already exists at this point. Do not throw and trigger a
          // duplicate video upload; retain the ID and surface the accessibility gap.
          console.warn(`  ⚠ YouTube caption upload failed for ${videoId}: ${toGoogleApiError(captionError).message}`);
        } finally {
          try {
            fs.rmSync(captionPath, { force: true });
          } catch {
            // Best-effort cleanup of a non-sensitive temporary caption file.
          }
        }
      }

      return videoId;
    }
    throw new YouTubeUploadOutcomeUnknownError(
      new Error('Upload succeeded but no video ID was returned.'),
    );
  } catch (_error: unknown) {
    if (_error instanceof YouTubeUploadOutcomeUnknownError) throw _error;
    console.info();
    const error = toGoogleApiError(_error);
    const errorMsg = error.response?.data?.error?.message || error.message || String(error);
    const errorCode = error.response?.status;
    console.error(`❌ YouTube API Error [${errorCode}]: ${errorMsg}`);
    
    if (error.response?.data?.error?.details) {
      console.error('   Details:', JSON.stringify(error.response.data.error.details, null, 2));
    }
    
    let finalMsg = `YouTube Upload Error: ${errorMsg}`;
    if (errorMsg.includes('invalid_grant')) {
      finalMsg += ' (Your Refresh Token has expired or is invalid. Please regenerate it using scripts/generate-youtube-token.ts)';
    }
    throw new Error(finalMsg);
  }
}
