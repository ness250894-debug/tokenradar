import { describe, expect, it } from "vitest";
import { REFERRALS, SOCIAL } from "../src/lib/config";
import {
  isAllowedPostUrl,
  isFirstPartyUrl,
  sanitizePostTextLinks,
  sanitizeTelegramPostLinks,
  tokenRadarUrl,
} from "../src/lib/social-link-policy";

describe("social post link policy", () => {
  it("allows TokenRadar first-party URLs and subdomains", () => {
    expect(isFirstPartyUrl("https://tokenradar.co")).toBe(true);
    expect(isFirstPartyUrl("https://media.tokenradar.co/video.mp4")).toBe(true);
    expect(isFirstPartyUrl("https://linktr.ee/tokenradarco")).toBe(false);
    expect(isFirstPartyUrl("https://example.com/tokenradar.co")).toBe(false);
  });

  it("allows configured social profiles and exchange referral links", () => {
    expect(isAllowedPostUrl(SOCIAL.xUrl)).toBe(true);
    expect(isAllowedPostUrl(`${SOCIAL.xUrl}/status/123`)).toBe(true);
    expect(isAllowedPostUrl(REFERRALS[0].url)).toBe(true);
    expect(isAllowedPostUrl("https://www.binance.com/markets")).toBe(false);
  });

  it("removes plain external URLs while preserving first-party URLs", () => {
    const text = "Read https://tokenradar.co/bitcoin, not https://example.com/report.";

    expect(sanitizePostTextLinks(text)).toBe("Read https://tokenradar.co/bitcoin, not.");
  });

  it("unwraps external markdown and Telegram links", () => {
    expect(sanitizePostTextLinks("Try [this](https://example.com) now")).toBe("Try this now");
    expect(sanitizeTelegramPostLinks('<a href="https://binance.com">Binance</a>')).toBe("Binance");
    expect(sanitizeTelegramPostLinks(`<a href="${REFERRALS[0].url}">Binance</a>`)).toBe(
      `<a href="${REFERRALS[0].url}">Binance</a>`,
    );
    expect(sanitizeTelegramPostLinks('<a href="https://tokenradar.co">TokenRadar</a>')).toBe(
      '<a href="https://tokenradar.co">TokenRadar</a>',
    );
  });

  it("builds first-party TokenRadar URLs", () => {
    expect(tokenRadarUrl("bitcoin")).toBe("https://tokenradar.co/bitcoin");
  });
});
