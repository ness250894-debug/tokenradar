import { describe, it, expect } from "vitest";
import {
  SITE_URL,
  SOCIAL,
  REFERRAL_LINKS_HTML,
  SOCIAL_FOOTER,
  X_COST_PER_POST,
} from "../src/lib/config";

describe("config exports", () => {
  it("exports a valid SITE_URL", () => {
    expect(SITE_URL).toMatch(/^https?:\/\//);
  });

  it("exports social handles with correct domains", () => {
    expect(SOCIAL.xUrl).toContain("x.com");
    expect(SOCIAL.telegramUrl).toContain("t.me");
  });

  it("exports referral links as non-empty array with HTML", () => {
    expect(REFERRAL_LINKS_HTML.length).toBeGreaterThan(0);
    expect(REFERRAL_LINKS_HTML.join("")).toContain("<a href=");
  });

  it("exports social footer as non-empty array", () => {
    expect(SOCIAL_FOOTER.length).toBeGreaterThan(0);
  });

  it("exports X_COST_PER_POST as $0.01", () => {
    expect(X_COST_PER_POST).toBe(0.01);
  });
});
