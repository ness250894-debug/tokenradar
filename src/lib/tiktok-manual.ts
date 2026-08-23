import { Api, InputFile } from "grammy";
import type { RawApi } from "grammy";
import { SOCIAL_PLATFORM_LIMITS } from "./config";
import { requireTelegramMessageId } from "./telegram";

const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_VIDEO_CAPTION_LIMIT = 1024;

export interface TikTokManualPostPackage {
  videoBuffer: Buffer;
  caption: string;
  tokenName: string;
  symbol: string;
  reason?: string;
  generatedAt?: string;
}

export interface TikTokManualReportResult {
  videoMessageId: number;
  captionMessageIds: number[];
}

export interface TikTokInboxUploadReportPackage {
  caption: string;
  tokenName: string;
  symbol: string;
  publishId: string;
  status?: string;
  failReason?: string;
  reason?: string;
  generatedAt?: string;
}

export interface TikTokInboxUploadReportResult {
  summaryMessageId: number;
  captionMessageIds: number[];
}

export function hasTikTokManualReportCredentials(): boolean {
  return Boolean(process.env.TELEGRAM_REPORT_BOT_TOKEN && process.env.TELEGRAM_REPORT_CHAT_ID);
}

function getReportingTelegramApi(): { api: Api<RawApi>; chatId: string } {
  const token = process.env.TELEGRAM_REPORT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_REPORT_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("TELEGRAM_REPORT_BOT_TOKEN and TELEGRAM_REPORT_CHAT_ID are required for TikTok manual reports.");
  }

  return { api: new Api(token), chatId };
}

function truncatePlainText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.substring(0, maxChars);
  return `${text.substring(0, maxChars - 3).trim()}...`;
}

export function buildTikTokManualVideoCaption(pkg: TikTokManualPostPackage): string {
  const generatedAt = pkg.generatedAt || new Date().toISOString();
  const captionLength = pkg.caption.length;
  const maxCaptionLength = SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT;

  return truncatePlainText(
    [
      `TikTok manual post ready: ${pkg.tokenName} ($${pkg.symbol.toUpperCase()})`,
      `Caption: ${captionLength}/${maxCaptionLength} chars`,
      `Generated: ${generatedAt}`,
      pkg.reason ? `Reason: ${pkg.reason}` : "",
      "Upload this video to TikTok, then copy the caption from the next message.",
    ].filter(Boolean).join("\n"),
    TELEGRAM_VIDEO_CAPTION_LIMIT,
  );
}

export function chunkTikTokManualCaption(caption: string): string[] {
  const cleanCaption = caption.trim();
  if (!cleanCaption) return ["TokenRadar market update.\n\n#Crypto #TokenRadar"];

  const chunks: string[] = [];
  for (let index = 0; index < cleanCaption.length; index += TELEGRAM_MESSAGE_LIMIT) {
    chunks.push(cleanCaption.slice(index, index + TELEGRAM_MESSAGE_LIMIT));
  }
  return chunks;
}

export function buildTikTokInboxUploadSummary(pkg: TikTokInboxUploadReportPackage): string {
  const generatedAt = pkg.generatedAt || new Date().toISOString();
  const captionLength = pkg.caption.length;
  const maxCaptionLength = SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT;

  return truncatePlainText(
    [
      `TikTok inbox upload ready: ${pkg.tokenName} ($${pkg.symbol.toUpperCase()})`,
      `Publish ID: ${pkg.publishId}`,
      pkg.status ? `Status: ${pkg.status}` : "",
      pkg.failReason ? `Failure reason: ${pkg.failReason}` : "",
      `Caption: ${captionLength}/${maxCaptionLength} chars`,
      `Generated: ${generatedAt}`,
      pkg.reason ? `Reason: ${pkg.reason}` : "",
      "Open TikTok, continue from the inbox notification, then paste the caption from the next message.",
    ].filter(Boolean).join("\n"),
    TELEGRAM_VIDEO_CAPTION_LIMIT,
  );
}

export async function sendTikTokInboxUploadReport(
  pkg: TikTokInboxUploadReportPackage,
): Promise<TikTokInboxUploadReportResult> {
  const { api, chatId } = getReportingTelegramApi();

  const summaryMessage = await api.sendMessage(chatId, buildTikTokInboxUploadSummary(pkg), {
    link_preview_options: { is_disabled: true },
  });
  const summaryMessageId = requireTelegramMessageId(summaryMessage, "sendMessage TikTok inbox summary");

  const captionMessageIds: number[] = [];
  for (const chunk of chunkTikTokManualCaption(pkg.caption)) {
    const message = await api.sendMessage(chatId, chunk, {
      link_preview_options: { is_disabled: true },
    });
    captionMessageIds.push(requireTelegramMessageId(message, "sendMessage TikTok inbox caption"));
  }

  return {
    summaryMessageId,
    captionMessageIds,
  };
}

export async function sendTikTokManualPostReport(pkg: TikTokManualPostPackage): Promise<TikTokManualReportResult> {
  const { api, chatId } = getReportingTelegramApi();
  const fileName = `tokenradar-${pkg.symbol.toLowerCase()}-tiktok.mp4`;

  const videoMessage = await api.sendVideo(chatId, new InputFile(pkg.videoBuffer, fileName), {
    caption: buildTikTokManualVideoCaption(pkg),
  });
  const videoMessageId = requireTelegramMessageId(videoMessage, "sendVideo TikTok manual package");

  const captionMessageIds: number[] = [];
  for (const chunk of chunkTikTokManualCaption(pkg.caption)) {
    const message = await api.sendMessage(chatId, chunk, {
      link_preview_options: { is_disabled: true },
    });
    captionMessageIds.push(requireTelegramMessageId(message, "sendMessage TikTok manual caption"));
  }

  return {
    videoMessageId,
    captionMessageIds,
  };
}
