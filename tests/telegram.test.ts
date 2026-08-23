import { describe, expect, it } from "vitest";
import {
  buildTelegramMediaCaption,
  getTelegramHtmlTextLength,
  isTelegramCreateOutcomeUnknownError,
  requireTelegramMessageId,
  sanitizeHtmlForTelegram,
} from "../src/lib/telegram";

describe("isTelegramCreateOutcomeUnknownError", () => {
  it("recognizes a grammY-shaped 502 response as ambiguous", () => {
    expect(isTelegramCreateOutcomeUnknownError(Object.assign(
      new Error("Call to sendPhoto failed! (502: Bad Gateway)"),
      { error_code: 502 },
    ))).toBe(true);
  });

  it("treats a successful-looking create without a usable message ID as ambiguous", () => {
    expect(() => requireTelegramMessageId({ message_id: undefined }, "sendPhoto"))
      .toThrowError(expect.objectContaining({ name: "TelegramCreateOutcomeUnknownError" }));
    expect(() => requireTelegramMessageId({ message_id: 0 }, "sendMessage"))
      .toThrowError(expect.objectContaining({ name: "TelegramCreateOutcomeUnknownError" }));
  });

  it("does not classify a definitive 400 rejection as ambiguous", () => {
    expect(isTelegramCreateOutcomeUnknownError(Object.assign(
      new Error("400: Bad Request: caption too long"),
      { error_code: 400 },
    ))).toBe(false);
  });

  it("recognizes grammY HttpError-shaped transport failures as ambiguous", () => {
    const error = Object.assign(new Error("Network request for 'sendPhoto' failed!"), {
      name: "HttpError",
      error: new TypeError("fetch failed"),
    });
    expect(isTelegramCreateOutcomeUnknownError(error)).toBe(true);
  });

  it("does not treat ordinary nested errors or unrelated 5xx-looking numbers as ambiguous", () => {
    expect(isTelegramCreateOutcomeUnknownError({
      error_code: 400,
      error: new Error("validation failed"),
    })).toBe(false);
    expect(isTelegramCreateOutcomeUnknownError(new Error("Caption supports up to 512 characters.")))
      .toBe(false);
  });
});
import { getTelegramFooter, SOCIAL_PLATFORM_LIMITS } from "../src/lib/config";

describe("sanitizeHtmlForTelegram", () => {
  it("preserves safe Telegram HTML tags", () => {
    const html = '<b>Bold</b> <a href="https://tokenradar.co">TokenRadar</a>';
    const result = sanitizeHtmlForTelegram(html);

    expect(result).toContain("<b>Bold</b>");
    expect(result).toContain('<a href="https://tokenradar.co">TokenRadar</a>');
  });

  it("removes unsafe link protocols and tag attributes", () => {
    const html = '<a href="javascript:alert(1)">bad</a><b onclick="alert(2)">safe</b>';
    const result = sanitizeHtmlForTelegram(html);

    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("onclick");
    expect(result).toContain("bad");
    expect(result).toContain("<b>safe</b>");
  });

  it("closes deeply nested malformed allowed tags", () => {
    const html = "<b><i><tg-spoiler>Risk note";
    const result = sanitizeHtmlForTelegram(html);

    expect(result).toBe("<b><i><tg-spoiler>Risk note</tg-spoiler></i></b>");
  });

  it("repairs crossed allowed tags into valid Telegram HTML nesting", () => {
    const html = "<b><i>Crossed</b> tags</i>";
    const result = sanitizeHtmlForTelegram(html);

    expect(result).toBe("<b><i>Crossed</i></b> tags");
  });

  it("preserves the premium Telegram research footer", () => {
    const footer = getTelegramFooter("river");
    const result = sanitizeHtmlForTelegram(footer);

    expect(result).toContain('<a href="https://tokenradar.co">');
    expect(result).not.toContain("linktr.ee");
    expect(result).toContain("TokenRadar Research Desk</a>");
    expect(result).toContain("Research read, not financial advice.");
    expect(result).toContain("Confirm liquidity, risk, and invalidation.");
    expect(result).not.toContain("Trade on top exchanges");
  });

  it("accepts a tracked first-party deep link in the footer", () => {
    const footer = getTelegramFooter(
      "btc",
      "https://tokenradar.co/bitcoin?utm_source=telegram&utm_medium=social&utm_content=btc-brief",
    );

    expect(footer).toContain("utm_content=btc-brief");
    expect(footer).toContain("TokenRadar Research Desk");
  });

  it("keeps media captions within Telegram's parsed text limit with the footer intact", () => {
    const longBody = [
      "$RIVER is building a chain-abstraction stablecoin system for cross-chain collateral and yield without bridging.",
      "This sentence is intentionally long enough to force a clean trim before the footer is appended.",
      "The old path added an ellipsis here and could hide the footer.",
    ].join(" ");
    const caption = buildTelegramMediaCaption(longBody, getTelegramFooter("river"), {
      maxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT,
      bodyMaxLength: 120,
    });

    expect(getTelegramHtmlTextLength(caption)).toBeLessThanOrEqual(SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT);
    expect(caption).toContain("TokenRadar Research Desk");
    expect(caption).toContain("Research read, not financial advice.");
    expect(caption).toContain("Confirm liquidity, risk, and invalidation.");
    expect(caption).toContain("#RIVER #Crypto");
    expect(caption).not.toContain("...");
  });
});
