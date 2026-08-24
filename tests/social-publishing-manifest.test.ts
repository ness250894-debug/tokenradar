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
    expect(manifest.version).toBeGreaterThanOrEqual(4);
    expect(manifest.measurement.windowsHours).toEqual([24, 168]);
    expect(manifest.measurement.maxLatenessHours).toBe(12);
    expect(manifest.platforms.telegram.maximumPostsPerDay).toBe(1);
    expect(manifest.platforms.telegram.maximumPostsPerWeek).toBe(6);
    expect(manifest.platforms.x.maximumPostsPerWeek).toBe(5);
    expect(manifest.platforms.instagram.maximumPostsPerWeek).toBe(4);
    expect(manifest.platforms.tiktok.status).toBe("paused");
    expect(manifest.routes.some((route) => route.platform === "tiktok")).toBe(false);
    expect(manifest.routes.filter((route) => route.id === "x-token-comparison")[0]?.cron)
      .toBe("23 12 * * 1");
    expect(manifest.routes.filter((route) => route.id === "instagram-reel")[0]?.cron)
      .toBe("47 18 * * 1,5");
    expect(manifest.routes.filter((route) => route.id === "x-native-video")[0]?.cron)
      .toBe("43 18 * * 3");
    expect(manifest.routes.filter((route) => route.id === "youtube-short")[0]?.cron)
      .toBe("57 18 * * 1,3,5");
    expect(manifest.routes.some((route) => route.id === "telegram-community-poll")).toBe(true);
    expect(manifest.routes.some((route) => route.id === "telegram-radar-divergence")).toBe(true);
    expect(manifest.platforms.telegram.communityCadence).toContain("Automated follow-up is not claimed");
    expect(manifest.routes.find((route) => route.id === "telegram-radar-divergence")?.purpose)
      .toContain("not a poll-result post");
    expect(uniqueSocialPublishingCrons(manifest).length).toBeLessThanOrEqual(manifest.routes.length);

    const weeklyRouteCounts = Object.fromEntries(Object.keys(manifest.platforms).map((platform) => [
      platform,
      manifest.routes
        .filter((route) => route.platform === platform)
        .reduce((total, route) => {
          const dayField = route.cron.trim().split(/\s+/)[4];
          return total + (dayField === "*" ? 7 : new Set((dayField || "").split(",").filter(Boolean)).size);
        }, 0),
    ]));
    expect(weeklyRouteCounts).toEqual({
      telegram: 6,
      x: 5,
      instagram: 4,
      threads: 3,
      youtube: 3,
      tiktok: 0,
    });
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

  it("rejects route calendars that exceed daily or weekly platform caps", () => {
    const manifest = structuredClone(getSocialPublishingManifest());
    manifest.platforms.x.maximumPostsPerWeek = 4;
    manifest.platforms.instagram.maximumPostsPerDay = 0;

    expect(validateSocialPublishingManifest(manifest)).toEqual(expect.arrayContaining([
      expect.stringContaining("x schedules 5 posts/week"),
      expect.stringContaining("instagram schedules 1 posts on weekday"),
    ]));
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

  it("binds every declared route cron to the workflow step that runs its command", () => {
    const manifest = getSocialPublishingManifest();
    const workflow = fs.readFileSync(
      path.resolve(process.cwd(), ".github/workflows/social-automations.yml"),
      "utf-8",
    );
    const bindings: Record<string, { flag: string; stepId: string }> = {
      "telegram-market-brief": { flag: "IS_TELEGRAM_MARKET_RUN", stepId: "telegram-market" },
      "telegram-radar-divergence": { flag: "IS_TELEGRAM_DIVERGENCE_RUN", stepId: "telegram-divergence" },
      "telegram-token-comparison": { flag: "IS_TELEGRAM_COMPARISON_RUN", stepId: "telegram-comparison" },
      "telegram-community-poll": { flag: "IS_TELEGRAM_POLL_RUN", stepId: "telegram-poll" },
      "telegram-weekly-recap": { flag: "IS_TELEGRAM_RECAP_RUN", stepId: "telegram-recap" },
      "telegram-movers-card": { flag: "IS_TELEGRAM_MOVERS_RUN", stepId: "telegram-movers" },
      "x-market-update": { flag: "IS_X_MARKET_RUN", stepId: "x-market" },
      "x-token-comparison": { flag: "IS_X_COMPARISON_RUN", stepId: "x-comparison" },
      "x-native-video": { flag: "IS_X_VIDEO_RUN", stepId: "x-video" },
      "instagram-movers-carousel": { flag: "IS_INSTAGRAM_CAROUSEL_RUN", stepId: "instagram-carousel" },
      "instagram-reel": { flag: "IS_INSTAGRAM_REEL_RUN", stepId: "instagram-reel" },
      "threads-text-signal": { flag: "IS_THREADS_TEXT_RUN", stepId: "threads-text" },
      "threads-weekly-recap": { flag: "IS_THREADS_RECAP_RUN", stepId: "threads-recap" },
      "youtube-short": { flag: "IS_YOUTUBE_VIDEO_RUN", stepId: "youtube-video" },
    };

    for (const route of manifest.routes) {
      const binding = bindings[route.id];
      expect(binding, `${route.id} needs an explicit workflow binding`).toBeDefined();
      if (!binding) throw new Error(`Missing workflow binding for ${route.id}`);
      const flagStart = workflow.indexOf(`  ${binding.flag}:`);
      const flagLine = workflow.slice(flagStart, workflow.indexOf("\n", flagStart));
      expect(flagLine, `${route.id} flag must own its cron`).toContain(`github.event.schedule == '${route.cron}'`);

      const stepStart = workflow.indexOf(`\n        id: ${binding.stepId}`);
      const blockStart = workflow.lastIndexOf("\n      - name:", stepStart);
      const blockEnd = workflow.indexOf("\n      - name:", stepStart + 1);
      const stepBlock = workflow.slice(blockStart, blockEnd);
      expect(stepBlock, `${route.id} step must use its flag`).toContain(`env.${binding.flag} == 'true'`);
      expect(stepBlock, `${route.id} step must run its declared command`).toContain(`run: ${route.command}`);
    }
  });
});
