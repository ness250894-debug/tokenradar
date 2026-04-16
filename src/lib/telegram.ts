import { Api, RawApi, InlineKeyboard, InputFile } from "grammy";
import { fetchWithRetry } from "./fetch-with-retry";

/**
 * Shared Api instance (lazy loaded)
 */
let sharedApi: Api<RawApi> | null = null;

function getApi(botToken?: string): Api<RawApi> {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
  
  // Hard crash only if actually trying to use the API at runtime
  if (!token) {
    console.warn("⚠ TELEGRAM_BOT_TOKEN is not set. API calls will fail at runtime.");
    // Return a dummy API instance if we're just evaluating modules during build
    return new Api("DUMMY_TOKEN");
  }
  
  // If we have a custom token, we can't use the shared one
  if (botToken) return new Api(botToken);
  
  if (!sharedApi) {
    sharedApi = new Api(token);
  }
  return sharedApi;
}

/**
 * Send a message to a Telegram channel/chat via the grammY SDK.
 *
 * @param text - HTML-formatted message text
 * @param chatId - Telegram chat or channel ID
 * @param botToken - Telegram bot token (defaults to env TELEGRAM_BOT_TOKEN)
 * @returns Message ID if successful
 */
export async function sendTelegramMessage(
  text: string,
  chatId: string,
  botToken?: string
): Promise<number> {
  const api = getApi(botToken);
  
  const message = await api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: false },
  });

  return message.message_id;
}

/**
 * Send a poll to a Telegram channel/chat via the grammY SDK.
 *
 * @param question - Poll question text
 * @param options - Array of answer options (min 2, max 10)
 * @param chatId - Telegram chat or channel ID
 * @param botToken - Telegram bot token
 * @returns Message ID if successful
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
 *
 * @param photoBuffer - The photo buffer
 * @param caption - Optional HTML caption
 * @param chatId - Telegram chat or channel ID
 * @param botToken - Telegram bot token
 * @returns Message ID if successful
 */
export async function sendTelegramPhoto(
  photoBuffer: Buffer,
  caption: string,
  chatId: string,
  botToken?: string
): Promise<number> {
  const api = getApi(botToken);
  
  // grammY's InputFile handles Buffers automatically
  const message = await api.sendPhoto(chatId, new InputFile(photoBuffer), {
    caption,
    parse_mode: "HTML",
  });

  return message.message_id;
}

/**
 * Send a video to a Telegram channel/chat via the grammY SDK.
 *
 * @param videoBuffer - The video buffer (e.g. mp4)
 * @param caption - Optional HTML caption
 * @param chatId - Telegram chat or channel ID
 * @param botToken - Telegram bot token
 * @returns Message ID if successful
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
 * Create a specialized Telegram keyboard (e.g. for TMA or external links).
 * 
 * @param buttons - Array of button objects { text: string, url: string }
 * @returns grammY InlineKeyboard
 */
export function createTelegramKeyboard(buttons: { text: string, url: string }[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  buttons.forEach(btn => {
    keyboard.url(btn.text, btn.url).row();
  });
  return keyboard;
}
