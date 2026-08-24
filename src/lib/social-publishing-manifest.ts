import manifestJson from "../../config/social-publishing.json";

export type SocialSchedulePlatform = "telegram" | "x" | "instagram" | "threads" | "youtube" | "tiktok";

export interface SocialScheduleRoute {
  id: string;
  platform: SocialSchedulePlatform;
  cron: string;
  command: string;
  purpose: string;
  format: string;
}

export interface SocialPlatformCadence {
  status: "active" | "paused";
  cadence: string;
  communityCadence: string;
  maximumPostsPerDay: number;
  maximumPostsPerWeek: number;
}

export interface SocialPublishingManifest {
  version: number;
  updatedAt: string;
  timezone: "UTC";
  profile: {
    canonicalBio: string;
    accountSideUpdateRequired: boolean;
  };
  measurement: {
    collectionCron: string;
    windowsHours: number[];
    maxLatenessHours: number;
    reportingHorizonHours: number;
    weeklyReportCron: string;
    lookbackDays: number;
  };
  platforms: Record<SocialSchedulePlatform, SocialPlatformCadence>;
  routes: SocialScheduleRoute[];
}

const CRON_FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
] as const;

function isSupportedCronExpression(cron: string): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== CRON_FIELD_RANGES.length) return false;
  return fields.every((field, index) => {
    if (field === "*") return true;
    const [minimum, maximum] = CRON_FIELD_RANGES[index];
    return field.split(",").every((entry) => {
      if (!/^\d{1,2}$/.test(entry)) return false;
      const value = Number(entry);
      return value >= minimum && value <= maximum;
    });
  });
}

function routeWeekdays(cron: string): number[] {
  const dayOfWeek = cron.trim().split(/\s+/)[4];
  if (!dayOfWeek) return [];
  if (dayOfWeek === "*") return [0, 1, 2, 3, 4, 5, 6];
  return [...new Set(dayOfWeek.split(",").map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))];
}

export function validateSocialPublishingManifest(manifest: SocialPublishingManifest): string[] {
  const errors: string[] = [];
  const routeIds = new Set<string>();

  if (!Number.isInteger(manifest.version) || manifest.version < 1) errors.push("version must be a positive integer");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.updatedAt)) errors.push("updatedAt must use YYYY-MM-DD");
  if (manifest.timezone !== "UTC") errors.push("timezone must be UTC");
  if (!manifest.profile.canonicalBio.trim()) errors.push("profile.canonicalBio is required");

  for (const windowHours of manifest.measurement.windowsHours) {
    if (!Number.isInteger(windowHours) || windowHours <= 0) {
      errors.push(`invalid measurement window: ${windowHours}`);
    }
  }
  if (new Set(manifest.measurement.windowsHours).size !== manifest.measurement.windowsHours.length) {
    errors.push("measurement windows must not contain duplicates");
  }
  if (!manifest.measurement.windowsHours.includes(24) || !manifest.measurement.windowsHours.includes(168)) {
    errors.push("measurement windows must include 24 and 168 hours");
  }
  if (!Number.isFinite(manifest.measurement.maxLatenessHours) || manifest.measurement.maxLatenessHours <= 0) {
    errors.push("measurement.maxLatenessHours must be positive");
  }
  if (!manifest.measurement.windowsHours.includes(manifest.measurement.reportingHorizonHours)) {
    errors.push("measurement.reportingHorizonHours must be one of measurement.windowsHours");
  }

  for (const [label, cron] of [
    ["measurement.collectionCron", manifest.measurement.collectionCron],
    ["measurement.weeklyReportCron", manifest.measurement.weeklyReportCron],
  ]) {
    if (!isSupportedCronExpression(cron)) errors.push(`${label} is not a supported cron expression`);
  }

  for (const route of manifest.routes) {
    if (routeIds.has(route.id)) errors.push(`duplicate route id: ${route.id}`);
    routeIds.add(route.id);
    if (!isSupportedCronExpression(route.cron)) errors.push(`${route.id} has an unsupported cron expression`);
    const minuteField = route.cron.trim().split(/\s+/)[0] || "";
    if (minuteField === "*" || minuteField.split(",").some((minute) => ["0", "00", "5", "05"].includes(minute))) {
      errors.push(`${route.id} uses a high-risk :00/:05 cron minute`);
    }
    const platform = manifest.platforms?.[route.platform];
    if (!platform) {
      errors.push(`${route.id} targets unknown platform ${route.platform}`);
    } else if (platform.status !== "active") {
      errors.push(`${route.id} targets paused platform ${route.platform}`);
    }
    if (!route.command.startsWith("npx tsx scripts/")) {
      errors.push(`${route.id} must invoke a repository script through npx tsx`);
    }
  }

  for (const [platformName, platform] of Object.entries(manifest.platforms)) {
    if (!platform.cadence.trim()) errors.push(`${platformName}.cadence is required`);
    if (!platform.communityCadence.trim()) errors.push(`${platformName}.communityCadence is required`);
    if (!Number.isInteger(platform.maximumPostsPerDay) || platform.maximumPostsPerDay < 0) {
      errors.push(`${platformName}.maximumPostsPerDay must be a non-negative integer`);
    }
    if (!Number.isInteger(platform.maximumPostsPerWeek) || platform.maximumPostsPerWeek < 0) {
      errors.push(`${platformName}.maximumPostsPerWeek must be a non-negative integer`);
    }

    const platformRoutes = manifest.routes.filter((route) => route.platform === platformName);
    const weeklyPosts = platformRoutes.reduce((total, route) => total + routeWeekdays(route.cron).length, 0);
    if (weeklyPosts > platform.maximumPostsPerWeek) {
      errors.push(
        `${platformName} schedules ${weeklyPosts} posts/week, above maximumPostsPerWeek ${platform.maximumPostsPerWeek}`,
      );
    }
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const postsOnDay = platformRoutes.filter((route) => routeWeekdays(route.cron).includes(weekday)).length;
      if (postsOnDay > platform.maximumPostsPerDay) {
        errors.push(
          `${platformName} schedules ${postsOnDay} posts on weekday ${weekday}, above maximumPostsPerDay ${platform.maximumPostsPerDay}`,
        );
      }
    }
  }

  return errors;
}

export function getSocialPublishingManifest(): SocialPublishingManifest {
  const manifest = manifestJson as SocialPublishingManifest;
  const errors = validateSocialPublishingManifest(manifest);
  if (errors.length > 0) {
    throw new Error(`Invalid social publishing manifest:\n- ${errors.join("\n- ")}`);
  }
  return manifest;
}

export function uniqueSocialPublishingCrons(manifest = getSocialPublishingManifest()): string[] {
  return [...new Set(manifest.routes.map((route) => route.cron))].sort();
}

function formatPlatform(value: string): string {
  return value === "x" ? "X" : value.charAt(0).toUpperCase() + value.slice(1);
}

export function renderSocialRotationCalendar(manifest = getSocialPublishingManifest()): string {
  const lines = [
    "# Social Rotation Calendar",
    "",
    `Generated from \`config/social-publishing.json\` version ${manifest.version} (${manifest.updatedAt}). Do not edit this file by hand.`,
    "",
    "## Canonical Profile Copy",
    "",
    `> ${manifest.profile.canonicalBio}`,
    "",
    manifest.profile.accountSideUpdateRequired
      ? "Applying this copy to public profiles is an account-side action and is not performed by repository automation."
      : "The approved copy matched the audited public profiles on 2026-08-24; future profile edits still require an authorized account owner.",
    "",
    "## Publishing Routes",
    "",
    "| Cron (UTC) | Platform | Format | Purpose |",
    "|---|---|---|---|",
    ...manifest.routes.map((route) =>
      `| \`${route.cron}\` | ${formatPlatform(route.platform)} | ${route.format} | ${route.purpose} |`,
    ),
    "",
    "## Platform Guardrails",
    "",
    "| Platform | Status | Daily maximum | Weekly maximum | Publishing cadence | Community routine |",
    "|---|---|---:|---:|---|---|",
    ...Object.entries(manifest.platforms).map(([platform, config]) =>
      `| ${formatPlatform(platform)} | ${config.status} | ${config.maximumPostsPerDay} | ${config.maximumPostsPerWeek} | ${config.cadence} | ${config.communityCadence} |`,
    ),
    "",
    "## Measurement Loop",
    "",
    `Native post metrics are collected at +${manifest.measurement.windowsHours.join("h and +")}h with at most ${manifest.measurement.maxLatenessHours}h sampling delay. ` +
      `The collector runs on \`${manifest.measurement.collectionCron}\`; the ${manifest.measurement.lookbackDays}-day performance report runs on \`${manifest.measurement.weeklyReportCron}\`.`,
    "",
    "Compare engagement per 1,000 impressions/views within each platform. Scale only formats with adequate samples that beat the platform median; rewrite or pause formats that repeatedly miss it. Preserve `utm_content` through GA4 so every platform, surface, archetype, and token can be joined back to a published post.",
    "",
  ];
  return lines.join("\n");
}

export function renderSocialPublishingRunbook(manifest = getSocialPublishingManifest()): string {
  const commands = manifest.routes.map((route) => `- \`${route.id}\`: \`${route.command}\``);
  return [
    "# Social Publishing Runbook",
    "",
    `Version ${manifest.version}, updated ${manifest.updatedAt}. Generated from \`config/social-publishing.json\`; do not edit by hand.`,
    "",
    "## Operating Policy",
    "",
    `Canonical public bio: “${manifest.profile.canonicalBio}”`,
    "",
    manifest.profile.accountSideUpdateRequired
      ? "The live account bios must be updated by an authorized account owner. Repository automation stores the approved source copy but does not mutate social profiles."
      : "The approved source copy matched the audited public profiles on 2026-08-24. Repository automation still does not mutate social profiles.",
    "",
    `Publishing is intentionally lower-volume: ${Object.entries(manifest.platforms)
      .map(([platform, config]) => `${formatPlatform(platform)} ${config.status === "paused" ? "is paused" : `is capped at ${config.maximumPostsPerWeek} originals/week`}`)
      .join(", ")}.`,
    "",
    "## Community Routine",
    "",
    ...Object.entries(manifest.platforms).map(([platform, config]) =>
      `- ${formatPlatform(platform)}: ${config.communityCadence}`,
    ),
    "",
    "## Route Commands",
    "",
    ...commands,
    "",
    "## Measurement Automation",
    "",
    `- Collection cron: \`${manifest.measurement.collectionCron}\``,
    `- Measurement windows: ${manifest.measurement.windowsHours.map((hours) => `+${hours}h`).join(", ")}`,
    `- Maximum sampling lateness: ${manifest.measurement.maxLatenessHours}h`,
    `- Weekly comparison horizon: +${manifest.measurement.reportingHorizonHours}h`,
    `- Weekly report cron: \`${manifest.measurement.weeklyReportCron}\``,
    "- Collector command: `npm run social:metrics:collect`",
    "- Weekly Markdown report: `npm run social:metrics:report:file`",
    "- Machine-readable report: `npm run social:metrics:report:json`",
    "",
    "The collector reads published post IDs from D1 and writes cumulative snapshots to `social_post_metrics`. Telegram reads the exact post's public channel-preview view count using `TELEGRAM_CHANNEL_USERNAME`; unavailable interaction fields remain null. X uses the existing bearer token. Instagram's Facebook Login flow requires `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`, and `instagram_manage_insights`; `pages_show_list` is only needed for account discovery because `IG_ACCOUNT_ID` is configured directly. Threads requires `threads_basic`, `threads_content_publish`, and `threads_manage_insights`. YouTube uses an API key for public statistics and OAuth for Analytics retention data. Re-run `scripts/generate-youtube-token.ts` once if the refresh token predates the `youtube.force-ssl`, `youtube.readonly`, and `yt-analytics.readonly` scopes. TikTok publishing remains paused, but historical post metrics can be collected through Display API `video.list` credentials; missing credentials produce an explicit skip instead of fabricated values.",
    "",
    "GA4 exports retain `sessionManualAdContent` and parse `utm_content` from landing URLs as a fallback. The daily export persists campaign aggregates to D1 `social_attribution_metrics`; its workflow is marked failed when that export breaks. The weekly report joins the latest 28-day row back to each post, labels attribution freshness, and excludes totals older than 72 hours. Trackers store `plannedUrl` separately from `publishedUrl`; a URL counts as published only after the post or follow-up containing it succeeds.",
    "",
    "## Retry and Reconciliation",
    "",
    "`--force` regenerates or bypasses local creative cooldowns; it does not override a durable published key and it preserves an existing partial-run creative package. Never use force to guess through `publishing` or `outcome_unknown` state.",
    "",
    "First confirm the owning workflow has completely stopped. The reconciliation CLI intentionally rejects `publishing` attempts because a platform request may still be in flight; there is no automatic stale-attempt takeover. Escalate a stale `publishing` row for run/attempt inspection instead of changing it while the worker may still be active.",
    "After the attempt is quiescent and the ledger is `outcome_unknown`, check the public platform feed and reconcile with `npm run social:delivery:reconcile -- --platform <platform> --content-key <key> --published-external-id <id>`. If and only if the feed and platform tools confirm that no public post exists, release it with `--release --verified-no-public-post --note \"<what was checked>\"`. Repeating the same public-ID action also heals an interrupted evidence-first ledger write.",
    "",
    "## Access and Cost Notes",
    "",
    "The X metrics read is billable under X API pay-per-usage pricing. Gemini caption/hook generation and the Claude fallback are billable model calls and are recorded in `ai_usage_events`. The Meta insights, YouTube Data/Analytics, GA4, and Search Console additions do not introduce a separate paid product in this repository, but remain subject to each provider's access approval, quota, and account terms. R2 and GitHub Actions can also exceed their included allowances.",
    "",
    "## Workflow Contract",
    "",
    "The GitHub workflow must declare the unique route crons from the manifest, isolate every route outcome so one platform cannot suppress another, and run the collector independently of publishing. Verify parity with `npm run docs:social:check` and the automation contract tests.",
    "",
  ].join("\n");
}
