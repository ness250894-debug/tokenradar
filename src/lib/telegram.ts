import { Api, InlineKeyboard, InputFile } from "grammy";
import type { RawApi } from "grammy";


/**
 * Shared Api instance (lazy loaded)
 */
let sharedApi: Api<RawApi> | null = null;

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
  let text = html;
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
          const hrefMatch = attrs.match(/href="([^"]*)"/i);
          if (hrefMatch) {
            placeholders.push(`<a href="${hrefMatch[1]}">`);
            return `\x00TAG${placeholders.length - 1}\x00`;
          }
        }
        return ""; // a tag without href is not allowed
      } else {
        placeholders.push(match);
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
  const stack: string[] = [];
  const finalTagRegex = /<\/?(b|i|a|code|pre|tg-spoiler)(\s[^>]*)?\s*>/gi;
  let match;
  while ((match = finalTagRegex.exec(sanitized)) !== null) {
    const isClosing = match[0].startsWith('</');
    const tagName = match[1].toLowerCase();
    if (isClosing) {
      const idx = stack.lastIndexOf(tagName);
      if (idx !== -1) stack.splice(idx, 1);
    } else {
      stack.push(tagName);
    }
  }

  while (stack.length > 0) {
    const tagName = stack.pop();
    sanitized += `</${tagName}>`;
  }

  return sanitized;
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

  return message.message_id;
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

  return poll.message_id;
}

/**
 * Send a photo to a Telegram channel/chat via the grammY SDK.
 */
export async function sendTelegramPhoto(
  photoBuffer: Buffer,
  caption: string,
  chatId: string,
  botToken?: string
): Promise<number> {
  const api = getApi(botToken);
  
  const message = await api.sendPhoto(chatId, new InputFile(photoBuffer), {
    caption,
    parse_mode: "HTML",
  });

  return message.message_id;
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

  return message.message_id;
}

/**
 * Create a specialized Telegram keyboard.
 */
export function createTelegramKeyboard(buttons: { text: string, url: string }[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  buttons.forEach(btn => {
    keyboard.url(btn.text, btn.url).row();
  });
  return keyboard;
}
