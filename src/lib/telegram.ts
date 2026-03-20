/**
 * TokenRadar — Shared Telegram Client
 *
 * Centralized Telegram messaging used by posting scripts and error reporting.
 */

/**
 * Send a message to a Telegram channel/chat via the Bot API.
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
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${error}`);
  }

  const data = (await response.json()) as { ok: boolean; result: { message_id: number } };
  if (!data.ok) throw new Error("Telegram API returned ok: false");
  return data.result.message_id;
}
