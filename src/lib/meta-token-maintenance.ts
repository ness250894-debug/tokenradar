import {
  getInstagramGraphBaseUrl,
  resolveInstagramAuthMode,
  type InstagramAuthEnvironment,
} from "./instagram-auth";

const FACEBOOK_GRAPH_BASE_URL = "https://graph.facebook.com/v25.0";
const THREADS_GRAPH_BASE_URL = "https://graph.threads.net";
const MIN_RENEWED_LIFETIME_SECONDS = 50 * 24 * 60 * 60;
const FACEBOOK_INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "pages_read_engagement",
] as const;
const INSTAGRAM_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
] as const;
const THREADS_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_manage_insights",
] as const;

export type MetaTokenEnvironment = InstagramAuthEnvironment & {
  IG_ACCOUNT_ID?: string;
  THREADS_ACCOUNT_ID?: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
};

export interface TokenMaintenanceResult {
  status: "refreshed" | "converted" | "healthy" | "skipped";
  accessToken?: string;
  expiresIn?: number;
  detail: string;
}

interface MetaErrorPayload {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
  };
}

interface RefreshPayload extends MetaErrorPayload {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface DebugTokenPayload extends MetaErrorPayload {
  data?: {
    app_id?: string | number;
    type?: string;
    is_valid?: boolean;
    expires_at?: number;
    data_access_expires_at?: number;
    scopes?: string[];
  };
}

interface InstagramIdentityPayload extends MetaErrorPayload {
  id?: string | number;
  user_id?: string | number;
  username?: string;
  data?: Array<{
    id?: string | number;
    user_id?: string | number;
    username?: string;
  }>;
}

interface FacebookPagePayload extends MetaErrorPayload {
  data?: Array<{
    id?: string;
    name?: string;
    access_token?: string;
    tasks?: string[];
    instagram_business_account?: { id?: string };
  }>;
  paging?: {
    next?: string;
  };
}

export class MetaTokenRequestError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly subcode?: number;

  constructor(label: string, status: number, payload: MetaErrorPayload) {
    const message = payload.error?.message?.trim() || "Unknown Meta API error";
    super(`${label} failed (HTTP ${status}${payload.error?.code ? `, code ${payload.error.code}` : ""}): ${message}`);
    this.name = "MetaTokenRequestError";
    this.status = status;
    this.code = payload.error?.code;
    this.subcode = payload.error?.error_subcode;
  }
}

async function readMetaJson<T extends MetaErrorPayload>(
  response: Response,
  label: string,
): Promise<T> {
  const text = await response.text();
  let payload: T;
  try {
    payload = (text.trim() ? JSON.parse(text) : {}) as T;
  } catch {
    throw new Error(`${label} returned invalid JSON (HTTP ${response.status}).`);
  }

  if (!response.ok || payload.error) {
    throw new MetaTokenRequestError(label, response.status, payload);
  }
  return payload;
}

async function fetchMetaJson<T extends MetaErrorPayload>(
  url: URL,
  label: string,
  fetchImpl: typeof fetch,
  init?: RequestInit,
): Promise<T> {
  return readMetaJson<T>(await fetchImpl(url, init), label);
}

function requireRenewedToken(payload: RefreshPayload, label: string): {
  accessToken: string;
  expiresIn: number;
} {
  const accessToken = payload.access_token?.trim();
  const expiresIn = Number(payload.expires_in);
  if (!accessToken) throw new Error(`${label} did not return an access_token.`);
  if (!Number.isFinite(expiresIn) || expiresIn < MIN_RENEWED_LIFETIME_SECONDS) {
    throw new Error(
      `${label} returned an unexpected lifetime (${String(payload.expires_in)} seconds); refusing to report a durable renewal.`,
    );
  }
  return { accessToken, expiresIn };
}

function isTooNewToRefresh(error: unknown): boolean {
  if (!(error instanceof MetaTokenRequestError)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("24 hour") ||
    message.includes("24-hour") ||
    message.includes("too new")
  );
}

function instagramIdentity(payload: InstagramIdentityPayload): {
  id?: string;
  userId?: string;
  username?: string;
} {
  const record = payload.data?.[0] || payload;
  return {
    id: record.id === undefined ? undefined : String(record.id),
    userId: record.user_id === undefined ? undefined : String(record.user_id),
    username: record.username,
  };
}

async function validateInstagramLoginToken(
  accessToken: string,
  expectedAccountId: string,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  const url = new URL(`${getInstagramGraphBaseUrl({ IG_AUTH_MODE: "instagram_login" })}/me`);
  url.searchParams.set("fields", "user_id,username");
  url.searchParams.set("access_token", accessToken);
  const payload = await fetchMetaJson<InstagramIdentityPayload>(
    url,
    "Instagram Login token validation",
    fetchImpl,
  );
  const identity = instagramIdentity(payload);
  if (!identity.userId) {
    throw new Error("Instagram Login token validation did not return user_id.");
  }
  if (identity.userId !== expectedAccountId) {
    throw new Error(
      `Instagram Login token belongs to account ${identity.userId}, not configured IG_ACCOUNT_ID ${expectedAccountId}.`,
    );
  }
  return identity.username;
}

async function validateFacebookInstagramToken(
  accessToken: string,
  expectedAccountId: string,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  const url = new URL(`${FACEBOOK_GRAPH_BASE_URL}/${encodeURIComponent(expectedAccountId)}`);
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);
  const payload = await fetchMetaJson<InstagramIdentityPayload>(
    url,
    "Facebook Login Instagram token validation",
    fetchImpl,
  );
  const identity = instagramIdentity(payload);
  if (identity.id !== expectedAccountId) {
    throw new Error(
      `Facebook Login token returned Instagram account ${identity.id || "unknown"}, not configured IG_ACCOUNT_ID ${expectedAccountId}.`,
    );
  }
  return identity.username;
}

async function validateFacebookInstagramCapabilities(
  accessToken: string,
  accountId: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const publishingUrl = new URL(
    `${FACEBOOK_GRAPH_BASE_URL}/${encodeURIComponent(accountId)}/content_publishing_limit`,
  );
  publishingUrl.searchParams.set("fields", "quota_usage,config");
  publishingUrl.searchParams.set("access_token", accessToken);
  await fetchMetaJson<MetaErrorPayload>(
    publishingUrl,
    "Instagram content-publishing capability check",
    fetchImpl,
  );

  const insightsUrl = new URL(
    `${FACEBOOK_GRAPH_BASE_URL}/${encodeURIComponent(accountId)}/insights`,
  );
  // A single stable metric is enough to prove insights access. Some metrics,
  // including profile_views, now require metric_type=total_value.
  insightsUrl.searchParams.set("metric", "reach");
  insightsUrl.searchParams.set("period", "day");
  insightsUrl.searchParams.set("access_token", accessToken);
  await fetchMetaJson<MetaErrorPayload>(
    insightsUrl,
    "Instagram insights capability check",
    fetchImpl,
  );
}

async function inspectMetaToken(
  accessToken: string,
  env: MetaTokenEnvironment,
  fetchImpl: typeof fetch,
  label: string,
): Promise<NonNullable<DebugTokenPayload["data"]>> {
  const appId = env.META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error(
      `META_APP_ID and META_APP_SECRET are required to inspect ${label}.`,
    );
  }

  const url = new URL(`${FACEBOOK_GRAPH_BASE_URL}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const payload = await fetchMetaJson<DebugTokenPayload>(
    url,
    `${label} inspection`,
    fetchImpl,
  );
  if (payload.data?.is_valid !== true) throw new Error(`${label} is invalid or expired.`);
  if (payload.data.app_id && String(payload.data.app_id) !== appId) {
    throw new Error(
      `${label} belongs to app ${payload.data.app_id}, not configured META_APP_ID ${appId}.`,
    );
  }
  return payload.data;
}

async function inspectThreadsToken(
  accessToken: string,
  fetchImpl: typeof fetch,
  label: string,
  expectedAppId?: string,
): Promise<NonNullable<DebugTokenPayload["data"]>> {
  // Threads supports OAuth self-inspection, so no app secret or client-
  // credentials token is needed (and no Facebook app credentials are reused).
  const url = new URL(`${THREADS_GRAPH_BASE_URL}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  const payload = await fetchMetaJson<DebugTokenPayload>(
    url,
    `${label} inspection`,
    fetchImpl,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (payload.data?.is_valid !== true) throw new Error(`${label} is invalid or expired.`);
  if (
    expectedAppId &&
    payload.data.app_id !== undefined &&
    String(payload.data.app_id) !== expectedAppId
  ) {
    throw new Error(
      `${label} belongs to app ${payload.data.app_id}, not the current token app ${expectedAppId}.`,
    );
  }
  return payload.data;
}

function requireTokenScopes(
  tokenInfo: NonNullable<DebugTokenPayload["data"]>,
  requiredScopes: readonly string[],
  label: string,
): void {
  if (!Array.isArray(tokenInfo.scopes)) {
    throw new Error(`${label} inspection did not return scopes; permissions cannot be verified.`);
  }
  const grantedScopes = new Set(tokenInfo.scopes);
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.has(scope));
  if (missingScopes.length > 0) {
    throw new Error(
      `${label} is missing required permissions: ${missingScopes.join(", ")}. Reauthorize it before maintenance can persist a token.`,
    );
  }
}

function requireInstagramAccountId(env: MetaTokenEnvironment): string {
  const accountId = env.IG_ACCOUNT_ID?.trim();
  if (!accountId) throw new Error("IG_ACCOUNT_ID is required for Instagram token maintenance.");
  return accountId;
}

function requireNonExpiringFacebookToken(
  tokenInfo: NonNullable<DebugTokenPayload["data"]>,
  label: string,
): number | undefined {
  if (tokenInfo.expires_at === undefined) {
    throw new Error(`${label} inspection did not return expires_at; durability cannot be verified.`);
  }
  const expiresAt = tokenInfo.expires_at;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    throw new Error(`${label} returned an invalid expires_at value.`);
  }
  if (expiresAt !== 0) {
    throw new Error(
      `${label} expires at ${new Date(expiresAt * 1000).toISOString()} and cannot be renewed automatically.`,
    );
  }

  if (tokenInfo.data_access_expires_at === undefined) return undefined;
  const dataAccessExpiresAt = tokenInfo.data_access_expires_at;
  if (
    typeof dataAccessExpiresAt !== "number" ||
    !Number.isFinite(dataAccessExpiresAt) ||
    dataAccessExpiresAt < 0
  ) {
    throw new Error(`${label} returned an invalid data_access_expires_at value.`);
  }
  if (dataAccessExpiresAt === 0) return undefined;

  const expiresIn = Math.floor(dataAccessExpiresAt - Date.now() / 1000);
  if (expiresIn <= 0) {
    throw new Error(
      `${label} data access expired at ${new Date(dataAccessExpiresAt * 1000).toISOString()}; reauthorization is required.`,
    );
  }
  return expiresIn;
}

function dataAccessDetail(expiresIn: number | undefined): string {
  if (expiresIn === undefined) return "";
  const expiresAt = new Date((Date.now() / 1000 + expiresIn) * 1000).toISOString();
  return ` Meta data access is separately scheduled to expire at ${expiresAt}; the weekly job will keep reporting it until reauthorization.`;
}

function requirePageTasks(tasks: string[] | undefined, label: string): void {
  if (!Array.isArray(tasks)) {
    throw new Error(`${label} did not return Page tasks; publishing and insights access cannot be verified.`);
  }
  const grantedTasks = new Set(tasks);
  const hasFullControl = [
    "MANAGE",
    "PROFILE_PLUS_FULL_CONTROL",
    "PROFILE_PLUS_MANAGE",
  ].some((task) => grantedTasks.has(task));
  const canCreate = hasFullControl || [
    "CREATE_CONTENT",
    "PROFILE_PLUS_CREATE_CONTENT",
  ].some((task) => grantedTasks.has(task));
  const canAnalyze = hasFullControl || [
    "ANALYZE",
    "PROFILE_PLUS_ANALYZE",
  ].some((task) => grantedTasks.has(task));
  if (!canCreate || !canAnalyze) {
    const missing = [
      ...(!canCreate ? ["CREATE_CONTENT"] : []),
      ...(!canAnalyze ? ["ANALYZE"] : []),
    ];
    throw new Error(`${label} is missing required Page tasks: ${missing.join(", ")}.`);
  }
}

async function discoverLinkedFacebookPage(
  initialUrl: URL,
  accountId: string,
  fetchImpl: typeof fetch,
): Promise<NonNullable<FacebookPagePayload["data"]>[number] | undefined> {
  let nextUrl: URL | undefined = initialUrl;
  for (let pageNumber = 0; nextUrl && pageNumber < 20; pageNumber += 1) {
    const payload: FacebookPagePayload = await fetchMetaJson<FacebookPagePayload>(
      nextUrl,
      "Facebook Page token discovery",
      fetchImpl,
    );
    const linkedPage = payload.data?.find(
      (page) => page.instagram_business_account?.id === accountId,
    );
    if (linkedPage) return linkedPage;

    const next = payload.paging?.next?.trim();
    if (!next) return undefined;
    const parsedNext = new URL(next);
    if (parsedNext.origin !== "https://graph.facebook.com") {
      throw new Error("Facebook Page pagination returned an unexpected host.");
    }
    nextUrl = parsedNext;
  }
  if (nextUrl) {
    throw new Error("Facebook Page discovery exceeded 20 pages; refusing an unbounded lookup.");
  }
  return undefined;
}

async function convertFacebookUserTokenToPageToken(
  currentToken: string,
  accountId: string,
  env: MetaTokenEnvironment,
  fetchImpl: typeof fetch,
): Promise<TokenMaintenanceResult> {
  const appId = env.META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error(
      "META_APP_ID and META_APP_SECRET are required to convert a Facebook User token.",
    );
  }

  // This is a one-time short/user -> long-lived user exchange. It is not used
  // as a recurring renewal mechanism; the resulting user token is immediately
  // converted to the linked Page token that the Instagram API consumes.
  const exchangeUrl = new URL(`${FACEBOOK_GRAPH_BASE_URL}/oauth/access_token`);
  exchangeUrl.searchParams.set("grant_type", "fb_exchange_token");
  exchangeUrl.searchParams.set("client_id", appId);
  exchangeUrl.searchParams.set("client_secret", appSecret);
  exchangeUrl.searchParams.set("fb_exchange_token", currentToken);
  const exchange = await fetchMetaJson<RefreshPayload>(
    exchangeUrl,
    "Facebook User token exchange",
    fetchImpl,
  );
  const longLivedUserToken = exchange.access_token?.trim();
  if (!longLivedUserToken) {
    throw new Error("Facebook User token exchange did not return an access_token.");
  }

  const pagesUrl = new URL(`${FACEBOOK_GRAPH_BASE_URL}/me/accounts`);
  pagesUrl.searchParams.set(
    "fields",
    "id,name,access_token,tasks,instagram_business_account",
  );
  pagesUrl.searchParams.set("limit", "100");
  pagesUrl.searchParams.set("access_token", longLivedUserToken);
  const linkedPage = await discoverLinkedFacebookPage(
    pagesUrl,
    accountId,
    fetchImpl,
  );
  const pageAccessToken = linkedPage?.access_token?.trim();
  if (!linkedPage || !pageAccessToken) {
    throw new Error(
      `No managed Facebook Page returned a token for Instagram account ${accountId}. Check the Page link and pages_show_list permission.`,
    );
  }
  requirePageTasks(linkedPage.tasks, `Facebook Page ${linkedPage.name || linkedPage.id || accountId}`);

  await validateFacebookInstagramToken(pageAccessToken, accountId, fetchImpl);
  await validateFacebookInstagramCapabilities(pageAccessToken, accountId, fetchImpl);
  const pageTokenInfo = await inspectMetaToken(
    pageAccessToken,
    env,
    fetchImpl,
    "Derived Page token",
  );
  requireTokenScopes(pageTokenInfo, FACEBOOK_INSTAGRAM_SCOPES, "Derived Page token");
  const dataAccessExpiresIn = requireNonExpiringFacebookToken(
    pageTokenInfo,
    "Derived Page token",
  );

  return {
    status: "converted",
    accessToken: pageAccessToken,
    ...(dataAccessExpiresIn !== undefined ? { expiresIn: dataAccessExpiresIn } : {}),
    detail: `Converted the Facebook User token to the non-expiring Page token for ${linkedPage.name || linkedPage.id || "the linked Page"}.${dataAccessDetail(dataAccessExpiresIn)}`,
  };
}

export async function maintainInstagramAccessToken(
  currentToken: string,
  env: MetaTokenEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenMaintenanceResult> {
  const accountId = requireInstagramAccountId(env);
  const mode = resolveInstagramAuthMode(env);

  if (mode === "instagram_login") {
    const tokenInfo = await inspectMetaToken(
      currentToken,
      env,
      fetchImpl,
      "Instagram Login token",
    );
    requireTokenScopes(tokenInfo, INSTAGRAM_LOGIN_SCOPES, "Instagram Login token");
    await validateInstagramLoginToken(currentToken, accountId, fetchImpl);
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", currentToken);

    let payload: RefreshPayload;
    try {
      payload = await fetchMetaJson<RefreshPayload>(
        url,
        "Instagram Login token refresh",
        fetchImpl,
      );
    } catch (error) {
      if (isTooNewToRefresh(error)) {
        return {
          status: "skipped",
          detail: "Instagram Login token is valid but less than 24 hours old.",
        };
      }
      throw error;
    }

    const renewed = requireRenewedToken(payload, "Instagram Login token refresh");
    const renewedTokenInfo = await inspectMetaToken(
      renewed.accessToken,
      env,
      fetchImpl,
      "Renewed Instagram Login token",
    );
    requireTokenScopes(
      renewedTokenInfo,
      INSTAGRAM_LOGIN_SCOPES,
      "Renewed Instagram Login token",
    );
    await validateInstagramLoginToken(renewed.accessToken, accountId, fetchImpl);
    return {
      status: "refreshed",
      accessToken: renewed.accessToken,
      expiresIn: renewed.expiresIn,
      detail: "Renewed the Instagram Login token for 60 days.",
    };
  }

  const tokenInfo = await inspectMetaToken(
    currentToken,
    env,
    fetchImpl,
    "Facebook Login token",
  );
  requireTokenScopes(tokenInfo, FACEBOOK_INSTAGRAM_SCOPES, "Facebook Login token");
  const tokenType = tokenInfo.type?.toUpperCase() || "UNKNOWN";
  if (tokenType === "USER") {
    requireTokenScopes(
      tokenInfo,
      [...FACEBOOK_INSTAGRAM_SCOPES, "pages_show_list"],
      "Facebook User token",
    );
    await validateFacebookInstagramToken(currentToken, accountId, fetchImpl);
    await validateFacebookInstagramCapabilities(currentToken, accountId, fetchImpl);
    return convertFacebookUserTokenToPageToken(
      currentToken,
      accountId,
      env,
      fetchImpl,
    );
  }
  if (tokenType !== "PAGE" && tokenType !== "SYSTEM_USER") {
    throw new Error(
      `Facebook Login token type ${tokenType} is not durable. Configure a Page or System User token.`,
    );
  }

  await validateFacebookInstagramToken(currentToken, accountId, fetchImpl);
  await validateFacebookInstagramCapabilities(currentToken, accountId, fetchImpl);
  const dataAccessExpiresIn = requireNonExpiringFacebookToken(
    tokenInfo,
    `Facebook ${tokenType} token`,
  );

  return {
    status: "healthy",
    ...(dataAccessExpiresIn !== undefined ? { expiresIn: dataAccessExpiresIn } : {}),
    detail: `Facebook ${tokenType} token is valid and the token itself has no scheduled expiration.${dataAccessDetail(dataAccessExpiresIn)}`,
  };
}

export async function maintainThreadsAccessToken(
  currentToken: string,
  env: MetaTokenEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenMaintenanceResult> {
  const accountId = env.THREADS_ACCOUNT_ID?.trim();
  if (!accountId) {
    throw new Error("THREADS_ACCOUNT_ID is required for Threads token maintenance.");
  }

  const validateThreadsToken = async (accessToken: string): Promise<void> => {
    const validationUrl = new URL(`${THREADS_GRAPH_BASE_URL}/v1.0/me`);
    validationUrl.searchParams.set("fields", "id,username");
    validationUrl.searchParams.set("access_token", accessToken);
    const payload = await fetchMetaJson<InstagramIdentityPayload>(
      validationUrl,
      "Threads token validation",
      fetchImpl,
    );
    const identity = instagramIdentity(payload);
    if (!identity.id) {
      throw new Error("Threads token validation did not return id.");
    }
    if (identity.id !== accountId) {
      throw new Error(
        `Threads token belongs to account ${identity.id}, not configured THREADS_ACCOUNT_ID ${accountId}.`,
      );
    }
  };

  const currentTokenInfo = await inspectThreadsToken(
    currentToken,
    fetchImpl,
    "Threads token",
  );
  requireTokenScopes(currentTokenInfo, THREADS_SCOPES, "Threads token");
  const currentAppId = currentTokenInfo.app_id === undefined
    ? undefined
    : String(currentTokenInfo.app_id);
  await validateThreadsToken(currentToken);

  const refreshUrl = new URL(`${THREADS_GRAPH_BASE_URL}/refresh_access_token`);
  refreshUrl.searchParams.set("grant_type", "th_refresh_token");
  refreshUrl.searchParams.set("access_token", currentToken);
  let payload: RefreshPayload;
  try {
    payload = await fetchMetaJson<RefreshPayload>(
      refreshUrl,
      "Threads token refresh",
      fetchImpl,
    );
  } catch (error) {
    if (isTooNewToRefresh(error)) {
      return {
        status: "skipped",
        detail: "Threads token is valid but less than 24 hours old.",
      };
    }
    throw error;
  }

  const renewed = requireRenewedToken(payload, "Threads token refresh");
  const renewedTokenInfo = await inspectThreadsToken(
    renewed.accessToken,
    fetchImpl,
    "Renewed Threads token",
    currentAppId,
  );
  requireTokenScopes(renewedTokenInfo, THREADS_SCOPES, "Renewed Threads token");
  await validateThreadsToken(renewed.accessToken);
  return {
    status: "refreshed",
    accessToken: renewed.accessToken,
    expiresIn: renewed.expiresIn,
    detail: "Renewed the Threads token for 60 days.",
  };
}
