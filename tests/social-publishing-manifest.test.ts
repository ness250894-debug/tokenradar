import * as fs from "fs";
import * as path from "path";

import { describe, expect, it } from "vitest";

import {
  getSocialPublishingManifest,
  renderSocialPublishingRunbook,
  renderSocialRotationCalendar,
  uniqueSocialPublishingCrons,
  validateSocialPublishingManifest,
} from "../src/lib/social-publishing-manifest";

describe("social publishing manifest", () => {
  it("is versioned, valid, lower-volume, and keeps TikTok paused", () => {
    const manifest = getSocialPublishingManifest();

    expect(validateSocialPublishingManifest(manifest)).toEqual([]);
    expect(manifest.version).toBeGreaterThanOrEqual(3);
    expect(manifest.measurement.windowsHours).toEqual([24, 168]);
    expect(manifest.platforms.telegram.maximumPostsPerDay).toBe(2);
    expect(manifest.platforms.tiktok.status).toBe("paused");
    expect(manifest.routes.some((route) => route.platform === "tiktok")).toBe(false);
    expect(manifest.routes.filter((route) => route.id === "x-token-comparison")[0]?.cron)
      .toBe("23 12 * * 1,3,5");
    expect(uniqueSocialPublishingCrons(manifest).length).toBeLessThanOrEqual(manifest.routes.length);
  });

  it("generates the calendar, runbook, and canonical profile copy", () => {
    const manifest = getSocialPublishingManifest();
    const calendar = renderSocialRotationCalendar(manifest);
    const runbook = renderSocialPublishingRunbook(manifest);

    expect(calendar).toContain("Generated from `config/social-publishing.json`");
    expect(runbook).toContain("npm run social:metrics:collect");
    expect(runbook).toContain("plannedUrl");
    expect(runbook).toContain("intentionally rejects `publishing`");
    expect(runbook).toContain("heals an interrupted evidence-first ledger write");
    expect(runbook).toContain(manifest.profile.canonicalBio);
  });

  it("rejects unknown platforms and every high-risk minute in a cron list", () => {
    const manifest = structuredClone(getSocialPublishingManifest());
    manifest.routes[0].cron = "0,30 00 * * *";
    (manifest.routes[0] as { platform: string }).platform = "mastodon";

    expect(validateSocialPublishingManifest(manifest)).toEqual(expect.arrayContaining([
      expect.stringContaining("uses a high-risk :00/:05 cron minute"),
      expect.stringContaining("targets unknown platform mastodon"),
    ]));

    manifest.routes[0].cron = "61 24 * * *";
    expect(validateSocialPublishingManifest(manifest)).toContainEqual(
      expect.stringContaining("unsupported cron expression"),
    );
  });

  it("does not let leading whitespace bypass high-risk minute validation", () => {
    const manifest = structuredClone(getSocialPublishingManifest());
    manifest.routes[0].cron = " 0 12 * * *";

    expect(validateSocialPublishingManifest(manifest)).toContain(
      `${manifest.routes[0].id} uses a high-risk :00/:05 cron minute`,
    );
  });

  it("rejects duplicate measurement windows that would repeat paid native reads", () => {
    const manifest = structuredClone(getSocialPublishingManifest());
    manifest.measurement.windowsHours = [24, 24, 168];

    expect(validateSocialPublishingManifest(manifest)).toContain(
      "measurement windows must not contain duplicates",
    );
  });

  it("keeps workflow crons and commands in exact parity with the manifest", () => {
    const manifest = getSocialPublishingManifest();
    const workflow = fs.readFileSync(
      path.resolve(process.cwd(), ".github/workflows/social-automations.yml"),
      "utf-8",
    );
    const actualCrons = [...workflow.matchAll(/- cron: "([^"]+)"/g)].map((match) => match[1]).sort();
    const expectedCrons = [
      ...uniqueSocialPublishingCrons(manifest),
      manifest.measurement.collectionCron,
      manifest.measurement.weeklyReportCron,
    ].sort();

    expect(actualCrons).toEqual(expectedCrons);
    for (const route of manifest.routes) {
      expect(workflow, `${route.id} command is missing`).toContain(route.command);
      expect(workflow, `${route.id} cron is not routed`).toContain(`github.event.schedule == '${route.cron}'`);
    }
    expect(workflow).toContain("npm run social:metrics:collect");
    expect(workflow).toContain("npm run social:metrics:report:file");
  });
});
