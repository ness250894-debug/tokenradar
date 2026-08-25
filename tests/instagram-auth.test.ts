import { describe, expect, it } from "vitest";

import {
  getInstagramGraphBaseUrl,
  resolveInstagramAuthMode,
} from "../src/lib/instagram-auth";

describe("Instagram authentication mode", () => {
  it("defaults to Facebook Login for an unset or blank mode", () => {
    expect(resolveInstagramAuthMode({})).toBe("facebook_login");
    expect(resolveInstagramAuthMode({ IG_AUTH_MODE: "   " })).toBe("facebook_login");
    expect(getInstagramGraphBaseUrl({})).toBe("https://graph.facebook.com/v25.0");
  });

  it("honors either explicit authentication family", () => {
    expect(resolveInstagramAuthMode({ IG_AUTH_MODE: "facebook_login" })).toBe(
      "facebook_login",
    );
    expect(resolveInstagramAuthMode({ IG_AUTH_MODE: " INSTAGRAM_LOGIN " })).toBe(
      "instagram_login",
    );
    expect(getInstagramGraphBaseUrl({ IG_AUTH_MODE: "instagram_login" })).toBe(
      "https://graph.instagram.com/v25.0",
    );
  });

  it("rejects an unknown mode instead of guessing from the token", () => {
    expect(() => resolveInstagramAuthMode({ IG_AUTH_MODE: "oauth" })).toThrow(
      'Invalid IG_AUTH_MODE "oauth"',
    );
  });
});
