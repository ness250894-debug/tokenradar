import { describe, expect, it } from "vitest";
import { sanitizeHtmlForTelegram } from "../src/lib/telegram";

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
});
