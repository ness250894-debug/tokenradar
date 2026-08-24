import { Api, InlineKeyboard, InputFile } from "grammy";
import type { RawApi } from "grammy";
import { isAllowedPostUrl, sanitizeTelegramPostLinks } from "./social-link-policy";

export class TelegramCreateOutcomeUnknownError extends Error {
  readonly cause?: unknown;

  constructor(operation: string, cause?: unknown) {
    super(`Telegram ${operation} returned without a valid message ID; the create outcome is unknown.`);
    this.name = "TelegramCreateOutcomeUnknownError";
    this.cause = cause;
  }
}

export function requireTelegramMessageId(
  message: { message_id?: unknown } | null | undefined,
  operation: string,
): number {
  const messageId = message?.message_id;
  if (typeof messageId !== "number" || !Number.isSafeInteger(messageId) || messageId <= 0) {
    throw new TelegramCreateOutcomeUnknownError(operation, message);
  }
  return messageId;
}

/** A single Bot API create may have succeeded when its response was lost. */
export function isTelegramCreateOutcomeUnknownError(error: unknown): boolean {
  if (error instanceof TelegramCreateOutcomeUnknownError) return true;
  const candidate = error as {
    name?: string;
    error?: unknown;
    error_code?: number;
    status?: number;
    response?: { status?: number; error_code?: number };
    message?: string;
  } | null | undefined;
  const status = candidate?.error_code
    ?? candidate?.status
    ?? candidate?.response?.error_code
    ?? candidate?.response?.status;
  if (status === 408 || (typeof status === "number" && status >= 500 && status <= 599)) return true;
  if (typeof status === "number") return false;
  if (candidate?.name === "HttpError") return true;
  const outerMessage = error instanceof Error ? error.message : String(candidate?.message || error);
  const nestedMessage = candidate?.error instanceof Error ? candidate.error.message : "";
  const message = `${outerMessage} ${nestedMessage}`;
  return /(?:timeout|timed out|socket hang up|connection reset|econnreset|fetch failed|network error|bad gateway|gateway timeout|service unavailable|internal server error|(?:HTTP|status(?:\s+code)?)\s*[:=]?\s*(?:408|5\d{2})\b)/i.test(message);
}


/**
 * Shared Api instance (lazy loaded)
 */
let sharedApi: Api<RawApi> | null = null;

function isSafeTelegramHref(href: string): boolean {
  return isAllowedPostUrl(href);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeTelegramHtmlEntities(value: string): string {
  let decoded = value;

  // Footer builders historically supplied an already escaped href. Normalize a
  // few nested layers so the final sanitizer owns the one and only encoding
  // pass. The cap avoids pathological entity expansion from untrusted copy.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = decoded
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_match, code: string) => {
        const parsed = Number(code);
        return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff ? String.fromCodePoint(parsed) : "";
      })
      .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
        const parsed = Number.parseInt(code, 16);
        return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff ? String.fromCodePoint(parsed) : "";
      });
    if (next === decoded) break;
    decoded = next;
  }

  return decoded;
}

function stripTelegramHtmlForLength(html: string): string {
  return decodeTelegramHtmlEntities(
    html
      .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
      .replace(/<\/?(b|i|code|pre|tg-spoiler)(\s[^>]*)?\s*>/gi, "")
      .replace(/<[^>]+>/g, ""),
  );
}

export function getTelegramHtmlTextLength(html: string): number {
  return stripTelegramHtmlForLength(html).length;
}

function removeDanglingTelegramTag(html: string): string {
  const lastLt = html.lastIndexOf("<");
  const lastGt = html.lastIndexOf(">");
  return lastLt > lastGt ? html.substring(0, lastLt) : html;
}

function closeAllowedTelegramTags(sanitized: string): string {
  const stack: string[] = [];
  const finalTagRegex = /<\/?(b|i|a|code|pre|tg-spoiler)(\s[^>]*)?\s*>/gi;
  let result = "";
  let lastIndex = 0;
  let match;
  while ((match = finalTagRegex.exec(sanitized)) !== null) {
    const isClosing = match[0].startsWith("</");
    const tagName = match[1].toLowerCase();
    result += sanitized.slice(lastIndex, match.index);

    if (isClosing) {
      const matchingIndex = stack.lastIndexOf(tagName);
      if (matchingIndex !== -1) {
        while (stack.length > matchingIndex) {
          result += `</${stack.pop()}>`;
        }
      }
    } else {
      stack.push(tagName);
      result += match[0];
    }

    lastIndex = finalTagRegex.lastIndex;
  }

  result += sanitized.slice(lastIndex);
  while (stack.length > 0) {
    const tagName = stack.pop();
    result += `</${tagName}>`;
  }

  return result;
}

function trimAtCleanBoundary(html: string): string {
  const sentenceEndings = [". ", ".\n", "! ", "!\n", "? ", "?\n"];
  const minBoundary = Math.floor(html.length * 0.55);
  let boundary = -1;
  let boundaryLength = 1;

  for (const ending of sentenceEndings) {
    const index = html.lastIndexOf(ending);
    if (index > boundary && index >= minBoundary) {
      boundary = index;
      boundaryLength = ending.startsWith(".") || ending.startsWith("!") || ending.startsWith("?") ? 1 : ending.length;
    }
  }

  if (boundary !== -1) {
    return closeAllowedTelegramTags(removeDanglingTelegramTag(html.substring(0, boundary + boundaryLength)).trim());
  }

  const whitespaceBoundary = html.lastIndexOf(" ");
  if (whitespaceBoundary > minBoundary) {
    return closeAllowedTelegramTags(removeDanglingTelegramTag(html.substring(0, whitespaceBoundary)).trim());
  }

  return closeAllowedTelegramTags(removeDanglingTelegramTag(html).trim());
}

export function truncateTelegramHtmlToTextLength(html: string, maxTextLength: number): string {
  if (maxTextLength <= 0) return "";

  const source = html.trim();
  let sanitized = sanitizeHtmlForTelegram(source, Number.MAX_SAFE_INTEGER).trim();
  if (getTelegramHtmlTextLength(sanitized) <= maxTextLength) return sanitized;

  let low = 0;
  let high = source.length;
  let best = "";

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = sanitizeHtmlForTelegram(
      removeDanglingTelegramTag(source.substring(0, mid)),
      Number.MAX_SAFE_INTEGER,
    ).trim();

    if (getTelegramHtmlTextLength(candidate) <= maxTextLength) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  sanitized = trimAtCleanBoundary(best);
  return getTelegramHtmlTextLength(sanitized) <= maxTextLength ? sanitized : best.trim();
}

export function buildTelegramMediaCaption(
  body: string,
  footer: string,
  options?: {
    maxLength?: number;
    bodyMaxLength?: number;
    separator?: string;
  },
): string {
  const maxLength = options?.maxLength ?? 1024;
  const separator = options?.separator ?? "\n\n";
  const sanitizedFooter = sanitizeHtmlForTelegram(footer.trim(), Number.MAX_SAFE_INTEGER).trim();
  const footerTextLength = getTelegramHtmlTextLength(sanitizedFooter);
  const separatorLength = sanitizedFooter ? separator.length : 0;
  const maxBodyLength = Math.max(0, maxLength - footerTextLength - separatorLength);
  const bodyLimit = Math.min(options?.bodyMaxLength ?? maxBodyLength, maxBodyLength);
  const sanitizedBody = truncateTelegramHtmlToTextLength(body, bodyLimit);

  if (!sanitizedFooter) return sanitizedBody;
  if (!sanitizedBody) return sanitizedFooter;
  return `${sanitizedBody}${separator}${sanitizedFooter}`;
}

export type TelegramResearchSurface =
  | "token"
  | "market"
  | "movers"
  | "comparison"
  | "recap"
  | "video";

export interface TelegramResearchCtaOptions {
  url: string;
  surface: TelegramResearchSurface;
  symbol?: string;
  hasTokenPage?: boolean;
  hashtags?: string[];
}

const TELEGRAM_RESEARCH_NOTES: Record<TelegramResearchSurface, string> = {
  token: "Point-in-time research. Recheck the source timestamp and liquidity before relying on it.",
  market: "Market snapshot, not a recommendation. Refresh the data before using the read later.",
  movers: "A fast move is not proof of quality. Check market depth, source time, and risk first.",
  comparison: "Use the same source window for both assets; refresh the comparison as conditions change.",
  recap: "Weekly context only. Recheck current market data before drawing a fresh conclusion.",
  video: "Research context only. Verify the current data and invalidation before acting on the clip.",
};

function cleanTelegramSymbol(symbol: string | undefined): string {
  return (symbol || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

export function getTelegramResearchCtaText(options: TelegramResearchCtaOptions): string {
  const symbol = cleanTelegramSymbol(options.symbol);
  if (options.hasTokenPage && symbol) return `Review $${symbol} research data`;

  switch (options.surface) {
    case "movers":
      return "Explore the full market research hub";
    case "comparison":
      return "Research both assets on TokenRadar";
    case "recap":
      return "Explore TokenRadar's research archive";
    case "video":
      return "Open the data behind this video";
    default:
      return "Explore TokenRadar market research";
  }
}

/**
 * Build a surface-specific research footer. The href is HTML-escaped here for
 * standalone validity and normalized by sanitizeHtmlForTelegram before send.
 */
export function buildTelegramResearchFooter(options: TelegramResearchCtaOptions): string {
  const lines: string[] = [];
  if (isSafeTelegramHref(options.url)) {
    lines.push(
      `<a href="${escapeHtmlAttribute(options.url)}">${getTelegramResearchCtaText(options)}</a>`,
    );
  }
  lines.push(TELEGRAM_RESEARCH_NOTES[options.surface]);

  const hashtags = (options.hashtags || [])
    .map((tag) => tag.trim())
    .filter((tag) => /^#[A-Za-z0-9_]{1,40}$/.test(tag))
    .slice(0, 3);
  if (hashtags.length > 0) lines.push(hashtags.join(" "));
  return lines.join("\n\n");
}

export function getApi(botToken?: string): Api<RawApi> {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
  
  // Hard crash only if actually trying to use the API at runtime
  if (!token) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("  ⚠ TELEGRAM_BOT_TOKEN is not set. API calls will fail at runtime.");
      // Return a dummy API instance if we're just evaluating modules during build
      return new Api("DUMMY_TOKEN");
    }
    throw new Error("TELEGRAM_BOT_TOKEN is required but not set in production.");
  }
  
  // If we have a custom token, we can't use the shared one
  if (botToken) return new Api(botToken);
  
  if (!sharedApi) {
    sharedApi = new Api(token);
  }
  return sharedApi;
}

/**
 * Sanitize and truncate AI-generated HTML for Telegram.
 * Escapes raw &, <, > while preserving allowed TG tags (b, i, a, code, pre, tg-spoiler).
 */
export function sanitizeHtmlForTelegram(html: string, maxLength: number = 4096): string {
  // 1. Truncate at sentence boundary if too long
  let text = sanitizeTelegramPostLinks(html);
  if (text.length > maxLength) {
    text = text.substring(0, maxLength);
    const lastSentence = Math.max(text.lastIndexOf(". "), text.lastIndexOf(".\n"));
    if (lastSentence > maxLength * 0.6) {
      text = text.substring(0, lastSentence + 1);
    }
  }

  // 2. Temporarily replace allowed tags with placeholders
  // We strictly whitelist tags and only allow 'href' for 'a'
  const placeholders: string[] = [];
  let sanitized = text.replace(/<\/?([a-z0-9-]+)(\s[^>]*)?\s*>/gi, (match, tagName, attrs) => {
    const tag = tagName.toLowerCase();
    const isAllowed = ["b", "i", "a", "code", "pre", "tg-spoiler"].includes(tag);
    
    if (isAllowed) {
      if (tag === 'a') {
        const isClosing = match.startsWith('</');
        if (isClosing) {
          placeholders.push('</a>');
          return `\x00TAG${placeholders.length - 1}\x00`;
        }
        if (attrs) {
          const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
          const normalizedHref = hrefMatch
            ? decodeTelegramHtmlEntities(hrefMatch[2]).trim()
            : "";
          if (normalizedHref && isSafeTelegramHref(normalizedHref)) {
            placeholders.push(`<a href="${escapeHtmlAttribute(normalizedHref)}">`);
            return `\x00TAG${placeholders.length - 1}\x00`;
          }
        }
        return ""; // a tag without href is not allowed
      } else {
        const isClosing = match.startsWith('</');
        placeholders.push(isClosing ? `</${tag}>` : `<${tag}>`);
        return `\x00TAG${placeholders.length - 1}\x00`;
      }
    }
    return ""; // Strip all other tags
  });

  // 3. Escape remaining HTML-special characters
  sanitized = sanitized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 4. Restore allowed tags
  sanitized = sanitized.replace(/\x00TAG(\d+)\x00/g, (_, idx) => placeholders[parseInt(idx)]);

  // 5. Ensure all allowed tags are closed to prevent "malformed" errors on TG
  return closeAllowedTelegramTags(sanitized);
}

/**
 * Send a message to a Telegram channel/chat via the grammY SDK.
 */
export async function sendTelegramMessage(
  text: string,
  chatId: string,
  options?: {
    botToken?: string;
    replyMarkup?: InlineKeyboard;
  }
): Promise<number> {
  const api = getApi(options?.botToken);
  
  const message = await api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: false },
    reply_markup: options?.replyMarkup,
  });

  return requireTelegramMessageId(message, "sendMessage");
}

/**
 * Send a poll to a Telegram channel/chat via the grammY SDK.
 */
export async function sendTelegramPoll(
  question: string,
  options: string[],
  chatId: string,
  botToken?: string
): Promise<number> {
  const api = getApi(botToken);

  const poll = await api.sendPoll(chatId, question, options, {
    is_anonymous: true,
  });

  return requireTelegramMessageId(poll, "sendPoll");
}

/**
 * Send a photo to a Telegram channel/chat via the grammY SDK.
 */
export async function sendTelegramPhoto(
  photoBuffer: Buffer,
  caption: string,
  chatId: string,
  botTokenOrOptions?: string | {
    botToken?: string;
    replyMarkup?: InlineKeyboard;
  },
): Promise<number> {
  const options = typeof botTokenOrOptions === "string"
    ? { botToken: botTokenOrOptions }
    : botTokenOrOptions;
  const api = getApi(options?.botToken);
  
  const message = await api.sendPhoto(chatId, new InputFile(photoBuffer), {
    caption,
    parse_mode: "HTML",
    reply_markup: options?.replyMarkup,
  });

  return requireTelegramMessageId(message, "sendPhoto");
}

/**
 * Send a video to a Telegram channel/chat via the grammY SDK.
 */
export async function sendTelegramVideo(
  videoBuffer: Buffer,
  caption: string,
  chatId: string,
  botToken?: string
): Promise<number> {
  const api = getApi(botToken);
  
  const message = await api.sendVideo(chatId, new InputFile(videoBuffer), {
    caption,
    parse_mode: "HTML",
  });

  return requireTelegramMessageId(message, "sendVideo");
}

/**
 * Create a specialized Telegram keyboard.
 */
export function createTelegramKeyboard(buttons: { text: string, url: string }[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  let hasButton = false;
  buttons.forEach(btn => {
    if (isAllowedPostUrl(btn.url)) {
      if (hasButton) keyboard.row();
      keyboard.url(btn.text, btn.url);
      hasButton = true;
    }
  });
  return keyboard;
}

/** A one-button, benefit-led first-party CTA for Telegram research posts. */
export function createTelegramResearchKeyboard(options: TelegramResearchCtaOptions): InlineKeyboard {
  return createTelegramKeyboard([{
    text: getTelegramResearchCtaText(options),
    url: options.url,
  }]);
}
