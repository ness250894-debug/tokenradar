import { describe, expect, it } from "vitest";

import {
  buildGoogleAnalyticsScriptUrl,
  getGoogleAnalyticsBootstrapCommands,
  sanitizeGoogleAnalyticsMeasurementId,
} from "../src/lib/google-analytics";

describe("google analytics bootstrap", () => {
  it("sanitizes GA4 measurement IDs before building the tag URL", () => {
    expect(sanitizeGoogleAnalyticsMeasurementId(" g-hbjpzz1m7d<script> ")).toBe("G-HBJPZZ1M7D");
    expect(buildGoogleAnalyticsScriptUrl(" g-hbjpzz1m7d<script> ")).toBe(
      "https://www.googletagmanager.com/gtag/js?id=G-HBJPZZ1M7D",
    );
  });

  it("boots the Google tag with analytics storage denied before config", () => {
    const commands = getGoogleAnalyticsBootstrapCommands("G-HBJPZZ1M7D");

    expect(commands).toEqual([
      [
        "consent",
        "default",
        {
          ad_personalization: "denied",
          ad_storage: "denied",
          ad_user_data: "denied",
          analytics_storage: "denied",
          wait_for_update: 500,
        },
      ],
      ["js", expect.any(Date)],
      [
        "config",
        "G-HBJPZZ1M7D",
        {
          anonymize_ip: true,
          send_page_view: true,
        },
      ],
    ]);
  });
});
