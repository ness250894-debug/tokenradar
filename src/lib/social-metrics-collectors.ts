import { SOCIAL } from "./config";
import { getInstagramGraphBaseUrl } from "./instagram-auth";

export type NativeMetricsPlatform = "telegram" | "x" | "instagram" | "threads" | "youtube" | "tiktok";

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
  /** Shared per-run cache so a batch refreshes TikTok OAuth at most once. */
  tiktokAccessTokenCache?: Map<string, Promise<string | null>>;
}

export type SocialMetricsEnv = Record<string, string | undefined>;

const UNAVAILABLE_OWNED_METRICS = ["linkClicks", "profileClicks", "watchTimeSeconds", "completionRate"];

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function compactPublicCount(value: string): number | undefined {
  const normalized = value.trim().replace(/,/g, "").toUpperCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)([KMB])?$/);
  if (!match) return undefined;
  const multiplier = match[2] === "K" ? 1_000 : match[2] === "M" ? 1_000_000 : match[2] === "B" ? 1_000_000_000 : 1;
  return finiteNumber(Number(match[1]) * multiplier);
}

function telegramPublicUsername(env: SocialMetricsEnv): string | null {
  const explicit = env.TELEGRAM_CHANNEL_USERNAME?.trim().replace(/^@/, "");
  if (explicit) return explicit;
  try {
    const pathname = new URL(SOCIAL.telegramUrl).pathname.replace(/^\/+/, "");
    return pathname || null;
  } catch {
    return null;
  }
}

async function collectTelegramMetrics(
  target: NativeMetricsTarget,
  fetchImpl: typeof fetch,
  env: SocialMetricsEnv,
): Promise<NativeMetricCollectionResult> {
  const username = telegramPublicUsername(env);
  if (!username) return { status: "skipped", reason: "Telegram public channel username is not configured" };
  if (!/^\d+$/.test(target.externalId.trim())) {
    return { status: "skipped", reason: "Telegram external ID is not a numeric message ID" };
  }

  const publicUrl = `https://t.me/s/${encodeURIComponent(username)}/${encodeURIComponent(target.externalId)}`;
  const response = await fetchImpl(publicUrl, {
    headers: { "User-Agent": "TokenRadar social metrics collector/1.0" },
  });
  if (!response.ok) throw new Error(`Telegram public preview failed (${response.status}).`);
  const html = await response.text();
  const marker = `data-post="${username}/${target.externalId}"`;
  const start = html.toLowerCase().indexOf(marker.toLowerCase());
  if (start < 0) throw new Error(`Telegram public preview did not contain ${username}/${target.externalId}.`);
  const nextMessage = html.indexOf("tgme_widget_message_wrap js-widget_message_wrap", start + marker.length);
  const block = html.slice(start, nextMessage > start ? nextMessage : html.length);
  const viewsText = block.match(/class="tgme_widget_message_views"[^>]*>([^<]+)</)?.[1] || "";
  const views = compactPublicCount(viewsText);
  if (views === undefined) throw new Error(`Telegram public preview did not expose views for ${target.externalId}.`);

  return {
    status: "collected",
    snapshot: {
      views,
      source: "telegram-public-preview",
      unavailableMetrics: [
        "impressions",
        "likes",
        "replies",
        "comments",
        "reposts",
        "shares",
        "saves",
        ...UNAVAILABLE_OWNED_METRICS,
      ],
      raw: { publicUrl },
    },
  };
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

  const baseUrl = getInstagramGraphBaseUrl(env);
  const mediaUrl = new URL(`${baseUrl}/${encodeURIComponent(target.externalId)}`);
  mediaUrl.searchParams.set("fields", "like_count,comments_count");
  mediaUrl.searchParams.set("access_token", accessToken);
  const insightUrl = new URL(`${baseUrl}/${encodeURIComponent(target.externalId)}/insights`);
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

function assertTikTokApiOk(payload: Record<string, unknown>, label: string): void {
  const error = payload.error;
  if (!error || typeof error !== "object") return;
  const code = String((error as { code?: unknown }).code ?? "ok");
  if (code === "ok" || code === "0") return;
  const message = String((error as { message?: unknown }).message || "unknown TikTok API error");
  throw new Error(`${label} failed (${code}: ${message}).`);
}

async function getTikTokMetricsAccessToken(
  fetchImpl: typeof fetch,
  env: SocialMetricsEnv,
  cache?: Map<string, Promise<string | null>>,
): Promise<string | null> {
  const refreshToken = env.TIKTOK_REFRESH_TOKEN?.trim();
  const clientKey = env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = env.TIKTOK_CLIENT_SECRET?.trim();
  if (refreshToken && clientKey && clientSecret) {
    const cacheKey = "tiktok-display-api-refresh";
    const existing = cache?.get(cacheKey);
    if (existing) return existing;

    const refreshPromise = (async (): Promise<string> => {
      const payload = await readJson(await fetchImpl("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      }), "TikTok token refresh");
      assertTikTokApiOk(payload, "TikTok token refresh");
      const token = typeof payload.access_token === "string"
        ? payload.access_token
        : payload.data && typeof payload.data === "object" && typeof (payload.data as { access_token?: unknown }).access_token === "string"
          ? String((payload.data as { access_token: string }).access_token)
          : "";
      if (!token) throw new Error("TikTok token refresh did not return an access token.");
      return token;
    })();
    cache?.set(cacheKey, refreshPromise);
    return refreshPromise;
  }

  return env.TIKTOK_ACCESS_TOKEN?.trim() || null;
}

async function collectTikTokMetrics(
  target: NativeMetricsTarget,
  fetchImpl: typeof fetch,
  env: SocialMetricsEnv,
  accessTokenCache?: Map<string, Promise<string | null>>,
): Promise<NativeMetricCollectionResult> {
  const accessToken = await getTikTokMetricsAccessToken(fetchImpl, env, accessTokenCache);
  if (!accessToken) {
    return {
      status: "skipped",
      reason: "TikTok video.list credentials are not configured",
    };
  }

  const url = new URL("https://open.tiktokapis.com/v2/video/query/");
  url.searchParams.set("fields", "id,view_count,like_count,comment_count,share_count");
  const payload = await readJson(await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filters: { video_ids: [target.externalId] } }),
  }), "TikTok video query");
  assertTikTokApiOk(payload, "TikTok video query");
  const data = payload.data && typeof payload.data === "object" ? payload.data as { videos?: unknown } : {};
  const videos = Array.isArray(data.videos) ? data.videos : [];
  const video = videos.find(
    (item) => item && typeof item === "object" && String((item as { id?: unknown }).id) === target.externalId,
  ) as Record<string, unknown> | undefined;
  if (!video) throw new Error(`TikTok video query did not return ${target.externalId}.`);

  return {
    status: "collected",
    snapshot: {
      views: finiteNumber(video.view_count),
      likes: finiteNumber(video.like_count),
      comments: finiteNumber(video.comment_count),
      shares: finiteNumber(video.share_count),
      source: "tiktok-display-api-v2",
      unavailableMetrics: [
        "impressions",
        "replies",
        "reposts",
        "saves",
        ...UNAVAILABLE_OWNED_METRICS,
      ],
      raw: { video },
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
  return ["telegram", "x", "instagram", "threads", "youtube", "tiktok"].includes(platform);
}

export async function collectNativeSocialMetrics(
  target: NativeMetricsTarget,
  dependencies: NativeMetricCollectorDependencies = {},
): Promise<NativeMetricCollectionResult> {
  if (!target.externalId.trim()) return { status: "skipped", reason: "published post has no external ID" };
  if (!isNativeMetricsPlatformSupported(target.platform)) {
    return { status: "skipped", reason: `no native collector is configured for ${target.platform}` };
  }

  const fetchImpl = dependencies.fetch || fetch;
  const env = dependencies.env || process.env;
  switch (target.platform) {
    case "telegram":
      return collectTelegramMetrics(target, fetchImpl, env);
    case "x":
      return collectXMetrics(target, fetchImpl, env);
    case "instagram":
      return collectInstagramMetrics(target, fetchImpl, env);
    case "threads":
      return collectThreadsMetrics(target, fetchImpl, env);
    case "youtube":
      return collectYouTubeMetrics(target, fetchImpl, env);
    case "tiktok":
      return collectTikTokMetrics(target, fetchImpl, env, dependencies.tiktokAccessTokenCache);
  }
}
