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

  it("preserves the Linktree ecosystem footer link", () => {
    const footer = getTelegramFooter("river");
    const result = sanitizeHtmlForTelegram(footer);

    expect(result).toContain('<a href="https://linktr.ee/tokenradarco">');
    expect(result).toContain("🌐 The TokenRadar Ecosystem</a>");
    expect(result).not.toContain("TokenRadar Links");
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
    expect(caption).toContain("🌐 The TokenRadar Ecosystem");
    expect(caption).toContain("#RIVER #Crypto");
    expect(caption).not.toContain("...");
  });
});
