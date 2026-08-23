export type NativeMetricsPlatform = "x" | "instagram" | "threads" | "youtube";

export interface NativeMetricsTarget {
  platform: string;
  contentKey: string;
  externalId: string;
  postedAt: string;
  horizonHours?: number;
}

export interface NativeMetricSnapshot {
  impressions?: number;
  views?: number;
  likes?: number;
  replies?: number;
  comments?: number;
  reposts?: number;
  shares?: number;
  saves?: number;
  linkClicks?: number;
  profileClicks?: number;
  watchTimeSeconds?: number;
  completionRate?: number;
  averageViewPercentage?: number;
  source: string;
  unavailableMetrics: string[];
  raw?: Record<string, unknown>;
}

export type NativeMetricCollectionResult =
  | { status: "collected"; snapshot: NativeMetricSnapshot }
  | { status: "skipped"; reason: string };

export interface NativeMetricCollectorDependencies {
  fetch?: typeof fetch;
  env?: SocialMetricsEnv;
}

export type SocialMetricsEnv = Record<string, string | undefined>;

const UNAVAILABLE_OWNED_METRICS = ["linkClicks", "profileClicks", "watchTimeSeconds", "completionRate"];

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function readJson(response: Response, label: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`${label} returned invalid JSON (${response.status}).`);
    }
  }

  if (!response.ok) {
    const apiError = payload.error;
    const message = typeof apiError === "object" && apiError !== null && "message" in apiError
      ? String((apiError as { message?: unknown }).message || "")
      : typeof apiError === "string"
        ? apiError
        : "";
    throw new Error(`${label} failed (${response.status}${message ? `: ${message}` : ""}).`);
  }
  return payload;
}

async function collectXMetrics(
  target: NativeMetricsTarget,
  fetchImpl: typeof fetch,
  env: SocialMetricsEnv,
): Promise<NativeMetricCollectionResult> {
  const bearer = env.X_BEARER_TOKEN?.trim();
  if (!bearer) return { status: "skipped", reason: "X_BEARER_TOKEN is not configured" };

  const url = new URL(`https://api.x.com/2/tweets/${encodeURIComponent(target.externalId)}`);
  url.searchParams.set("tweet.fields", "public_metrics");
  const payload = await readJson(await fetchImpl(url, {
    headers: { Authorization: `Bearer ${bearer}` },
  }), "X metrics API");
  const data = payload.data as { public_metrics?: Record<string, unknown> } | undefined;
  if (!data?.public_metrics) throw new Error(`X metrics API did not return public_metrics for ${target.externalId}.`);
  const metrics = data.public_metrics;

  return {
    status: "collected",
    snapshot: {
      impressions: finiteNumber(metrics.impression_count),
      likes: finiteNumber(metrics.like_count),
      replies: finiteNumber(metrics.reply_count),
      reposts: finiteNumber(metrics.retweet_count),
      shares: finiteNumber(metrics.quote_count),
      saves: finiteNumber(metrics.bookmark_count),
      source: "x-v2-public-metrics",
      unavailableMetrics: [
        "views",
        ...UNAVAILABLE_OWNED_METRICS,
        ...(finiteNumber(metrics.bookmark_count) === undefined ? ["saves"] : []),
      ],
      raw: { publicMetrics: metrics },
    },
  };
}

function readInsightMap(payload: Record<string, unknown>): Record<string, number> {
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const metrics: Record<string, number> = {};
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as { name?: unknown; values?: unknown; value?: unknown };
    const name = typeof record.name === "string" ? record.name : "";
    const values = Array.isArray(record.values) ? record.values : [];
    const firstValue = values[0] && typeof values[0] === "object"
      ? (values[0] as { value?: unknown }).value
      : record.value;
    const value = finiteNumber(firstValue);
    if (name && value !== undefined) metrics[name] = value;
  }
  return metrics;
}

async function collectInstagramMetrics(
  target: NativeMetricsTarget,
  fetchImpl: typeof fetch,
  env: SocialMetricsEnv,
): Promise<NativeMetricCollectionResult> {
  const accessToken = env.IG_ACCESS_TOKEN?.trim();
  if (!accessToken) return { status: "skipped", reason: "IG_ACCESS_TOKEN is not configured" };

  const mediaUrl = new URL(`https://graph.facebook.com/v25.0/${encodeURIComponent(target.externalId)}`);
  mediaUrl.searchParams.set("fields", "like_count,comments_count");
  mediaUrl.searchParams.set("access_token", accessToken);
  const insightUrl = new URL(`https://graph.facebook.com/v25.0/${encodeURIComponent(target.externalId)}/insights`);
  insightUrl.searchParams.set("metric", "views,reach,saved,shares,total_interactions");
  insightUrl.searchParams.set("access_token", accessToken);

  const [media, insightPayload] = await Promise.all([
    readJson(await fetchImpl(mediaUrl), "Instagram media API"),
    readJson(await fetchImpl(insightUrl), "Instagram insights API"),
  ]);
  const insights = readInsightMap(insightPayload);

  return {
    status: "collected",
    snapshot: {
      views: finiteNumber(insights.views),
      likes: finiteNumber(media.like_count),
      comments: finiteNumber(media.comments_count),
      shares: finiteNumber(insights.shares),
      saves: finiteNumber(insights.saved),
      source: "instagram-graph-insights",
      unavailableMetrics: ["impressions", ...UNAVAILABLE_OWNED_METRICS],
      raw: {
        reach: finiteNumber(insights.reach),
        totalInteractions: finiteNumber(insights.total_interactions),
      },
    },
  };
}

async function collectThreadsMetrics(
  target: NativeMetricsTarget,
  fetchImpl: typeof fetch,
  env: SocialMetricsEnv,
): Promise<NativeMetricCollectionResult> {
  const accessToken = env.THREADS_ACCESS_TOKEN?.trim();
  if (!accessToken) return { status: "skipped", reason: "THREADS_ACCESS_TOKEN is not configured" };

  const url = new URL(`https://graph.threads.net/v1.0/${encodeURIComponent(target.externalId)}/insights`);
  url.searchParams.set("metric", "views,likes,replies,reposts,quotes,shares");
  url.searchParams.set("access_token", accessToken);
  const payload = await readJson(await fetchImpl(url), "Threads insights API");
  const insights = readInsightMap(payload);
  const shares = finiteNumber(insights.shares);
  const quotes = finiteNumber(insights.quotes);
  const combinedShares = shares === undefined && quotes === undefined
    ? undefined
    : (shares || 0) + (quotes || 0);

  return {
    status: "collected",
    snapshot: {
      impressions: finiteNumber(insights.views),
      views: finiteNumber(insights.views),
      likes: finiteNumber(insights.likes),
      replies: finiteNumber(insights.replies),
      reposts: finiteNumber(insights.reposts),
      shares: combinedShares,
      source: "threads-graph-insights",
      unavailableMetrics: [
        ...UNAVAILABLE_OWNED_METRICS,
        "comments",
        "saves",
        ...(combinedShares === undefined ? ["shares"] : []),
      ],
      raw: { quotes: finiteNumber(insights.quotes) },
    },
  };
}

async function getYouTubeAccessToken(fetchImpl: typeof fetch, env: SocialMetricsEnv): Promise<string | null> {
  const clientId = env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = env.YOUTUBE_CLIENT_SECRET?.trim();
  const refreshToken = env.YOUTUBE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const payload = await readJson(await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }), "YouTube OAuth");
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) throw new Error("YouTube OAuth response did not include an access token.");
  return accessToken;
}

async function collectYouTubeMetrics(
  target: NativeMetricsTarget,
  fetchImpl: typeof fetch,
  env: SocialMetricsEnv,
): Promise<NativeMetricCollectionResult> {
  const apiKey = env.YOUTUBE_API_KEY?.trim();
  let accessToken: string | null = null;
  let analyticsAuthError: string | undefined;
  if (!apiKey) {
    accessToken = await getYouTubeAccessToken(fetchImpl, env);
  }
  if (!apiKey && !accessToken) {
    return {
      status: "skipped",
      reason: "YOUTUBE_API_KEY or YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET/YOUTUBE_REFRESH_TOKEN is not configured",
    };
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", target.externalId);
  if (apiKey) url.searchParams.set("key", apiKey);
  const payload = await readJson(await fetchImpl(url, !apiKey && accessToken ? {
    headers: { Authorization: `Bearer ${accessToken}` },
  } : undefined), "YouTube Data API");
  const items = Array.isArray(payload.items) ? payload.items : [];
  const item = items[0] as { statistics?: Record<string, unknown> } | undefined;
  if (!item?.statistics) throw new Error(`YouTube Data API did not return statistics for ${target.externalId}.`);
  const statistics = item.statistics;
  let watchTimeSeconds: number | undefined;
  let averageViewPercentage: number | undefined;
  let analyticsError: string | undefined;
  if (apiKey && target.horizonHours !== undefined && target.horizonHours >= 168) {
    try {
      accessToken = await getYouTubeAccessToken(fetchImpl, env);
    } catch (error) {
      analyticsAuthError = error instanceof Error ? error.message : String(error);
      accessToken = null;
    }
  }
  let analyticsRange: { startDate: string; endDate: string; timeZone: string } | undefined;
  if (accessToken && (target.horizonHours ?? 0) >= 168) {
    const timeZone = "America/Los_Angeles";
    const dateInPacific = (date: Date): string => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
      return `${part("year")}-${part("month")}-${part("day")}`;
    };
    const startDate = dateInPacific(new Date(target.postedAt));
    const latestCompleteDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const endDate = dateInPacific(latestCompleteDate);
    analyticsRange = { startDate, endDate, timeZone };
    if (endDate >= startDate) {
      try {
        const analyticsUrl = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
        analyticsUrl.searchParams.set("ids", "channel==MINE");
        analyticsUrl.searchParams.set("startDate", startDate);
        analyticsUrl.searchParams.set("endDate", endDate);
        analyticsUrl.searchParams.set("metrics", "views,estimatedMinutesWatched,averageViewPercentage");
        analyticsUrl.searchParams.set("filters", `video==${target.externalId}`);
        const analytics = await readJson(await fetchImpl(analyticsUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }), "YouTube Analytics API");
        const headers = Array.isArray(analytics.columnHeaders) ? analytics.columnHeaders : [];
        const rows = Array.isArray(analytics.rows) ? analytics.rows : [];
        if (rows.length === 0) {
          throw new Error("YouTube Analytics API returned no complete calendar aggregate yet.");
        }
        const values = Array.isArray(rows[0]) ? rows[0] : [];
        const analyticsValues = Object.fromEntries(headers.map((header, index) => {
          const name = header && typeof header === "object" && "name" in header
            ? String((header as { name?: unknown }).name || "")
            : "";
          return [name, values[index]];
        }));
        const minutes = finiteNumber(analyticsValues.estimatedMinutesWatched);
        averageViewPercentage = finiteNumber(analyticsValues.averageViewPercentage);
        watchTimeSeconds = minutes === undefined ? undefined : minutes * 60;
      } catch (error) {
        analyticsError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  const unavailableMetrics = ["impressions", "linkClicks", "profileClicks", "replies", "reposts", "shares", "saves"];
  if (watchTimeSeconds === undefined) unavailableMetrics.push("watchTimeSeconds");
  unavailableMetrics.push("completionRate");
  if (averageViewPercentage === undefined) unavailableMetrics.push("averageViewPercentage");

  return {
    status: "collected",
    snapshot: {
      views: finiteNumber(statistics.viewCount),
      likes: finiteNumber(statistics.likeCount),
      comments: finiteNumber(statistics.commentCount),
      watchTimeSeconds,
      averageViewPercentage,
      source: watchTimeSeconds !== undefined || averageViewPercentage !== undefined
        ? "youtube-data-v3+analytics-v2"
        : "youtube-data-v3-statistics",
      unavailableMetrics,
      raw: { statistics, analyticsError, analyticsAuthError, analyticsRange, averageViewPercentage },
    },
  };
}

export function isNativeMetricsPlatformSupported(platform: string): platform is NativeMetricsPlatform {
  return ["x", "instagram", "threads", "youtube"].includes(platform);
}

export async function collectNativeSocialMetrics(
  target: NativeMetricsTarget,
  dependencies: NativeMetricCollectorDependencies = {},
): Promise<NativeMetricCollectionResult> {
  if (!target.externalId.trim()) return { status: "skipped", reason: "published post has no external ID" };
  if (!isNativeMetricsPlatformSupported(target.platform)) {
    const reason = target.platform === "telegram"
      ? "Telegram Bot API does not expose per-channel-post view metrics"
      : target.platform === "tiktok"
        ? "TikTok scheduled publishing and collection are paused"
        : `no native collector is configured for ${target.platform}`;
    return { status: "skipped", reason };
  }

  const fetchImpl = dependencies.fetch || fetch;
  const env = dependencies.env || process.env;
  switch (target.platform) {
    case "x":
      return collectXMetrics(target, fetchImpl, env);
    case "instagram":
      return collectInstagramMetrics(target, fetchImpl, env);
    case "threads":
      return collectThreadsMetrics(target, fetchImpl, env);
    case "youtube":
      return collectYouTubeMetrics(target, fetchImpl, env);
  }
}
