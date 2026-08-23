import { describe, it, expect } from "vitest";
import {
  SITE_URL,
  SOCIAL,
  REFERRAL_LINKS_HTML,
  SOCIAL_FOOTER,
  X_COST_PER_POST,
  X_API_UNIT_COSTS,
} from "../src/lib/config";

describe("config exports", () => {
  it("exports a valid SITE_URL", () => {
    expect(SITE_URL).toMatch(/^https?:\/\//);
  });

  it("exports social handles with correct domains", () => {
    expect(SOCIAL.xUrl).toContain("x.com");
    expect(SOCIAL.telegramUrl).toContain("t.me");
    expect(SOCIAL.threadsUrl).toBe("https://www.threads.com/@tokenradarco");
    expect(SOCIAL.instagramUrl).toBe("https://www.instagram.com/tokenradarco/");
    expect(SOCIAL.tiktokUrl).toBe("https://www.tiktok.com/@tokenradarco");
    expect(SOCIAL.linkTreeUrl).toBe("https://linktr.ee/tokenradarco");
    expect(SOCIAL.ecosystemUrl).toBe(SITE_URL);
  });

  it("exports referral links as non-empty array with HTML", () => {
    expect(REFERRAL_LINKS_HTML.length).toBeGreaterThan(0);
    expect(REFERRAL_LINKS_HTML.join("")).toContain("<a href=");
  });

  it("exports social footer as non-empty array", () => {
    expect(SOCIAL_FOOTER.length).toBeGreaterThan(0);
    expect(SOCIAL_FOOTER.join("")).toContain(`<a href="${SITE_URL}">`);
    expect(SOCIAL_FOOTER.join("")).not.toContain(SOCIAL.linkTreeUrl);
    expect(SOCIAL_FOOTER.join("")).toContain("TokenRadar Research Desk");
    expect(SOCIAL_FOOTER.join("")).toContain("Research read, not financial advice.");
  });

  it("exports current X pay-per-use unit costs", () => {
    expect(X_COST_PER_POST).toBe(0.015);
    expect(X_API_UNIT_COSTS).toEqual({
      CONTENT_CREATE: 0.015,
      CONTENT_CREATE_WITH_URL: 0.2,
      ANALYTICS_READ: 0.005,
      OWNED_READ: 0.001,
    });
  });
});
