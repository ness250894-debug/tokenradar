import { describe, expect, it } from "vitest";
import {
  buildTelegramMediaCaption,
  getTelegramHtmlTextLength,
  sanitizeHtmlForTelegram,
} from "../src/lib/telegram";
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

    expect(result).toContain('<a href="https://linktr.ee/tokenradarco">');
    expect(result).toContain("TokenRadar Research Desk</a>");
    expect(result).toContain("Research read, not financial advice.");
    expect(result).toContain("Confirm liquidity, risk, and invalidation.");
    expect(result).not.toContain("Trade on top exchanges");
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
