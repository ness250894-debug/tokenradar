import { REFERRALS, SITE_URL, SOCIAL } from "./config";

const FIRST_PARTY_ROOT_HOST = "tokenradar.co";
const HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;

const CONNECTED_PREFIX_URLS = [
  SOCIAL.xUrl,
  SOCIAL.telegramUrl,
  SOCIAL.threadsUrl,
  SOCIAL.instagramUrl,
];

const CONNECTED_EXACT_URLS = [
  SOCIAL.ecosystemUrl,
  ...REFERRALS.map((referral) => referral.url),
];

function normalizeWhitespace(value: string): string {
  return value
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitTrailingPunctuation(value: string): { url: string; trailing: string } {
  let url = value;
  let trailing = "";

  while (/[),.!?:;\]]$/.test(url)) {
    trailing = `${url.slice(-1)}${trailing}`;
    url = url.slice(0, -1);
  }

  return { url, trailing };
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function normalizeUrlForComparison(value: string): string | null {
  const url = parseHttpUrl(value);
  if (!url) return null;
  return [
    url.protocol,
    "//",
    url.hostname.toLowerCase(),
    url.port ? `:${url.port}` : "",
    normalizePathname(url.pathname),
    url.search,
  ].join("");
}

function hasSameOrigin(left: URL, right: URL): boolean {
  return (
    left.protocol === right.protocol &&
    left.hostname.toLowerCase() === right.hostname.toLowerCase() &&
    left.port === right.port
  );
}

export function isFirstPartyUrl(value: string): boolean {
  const url = parseHttpUrl(value);
  if (!url) return false;
  const hostname = url.hostname.toLowerCase();
  return hostname === FIRST_PARTY_ROOT_HOST || hostname.endsWith(`.${FIRST_PARTY_ROOT_HOST}`);
}

function isConnectedExactUrl(value: string): boolean {
  const normalized = normalizeUrlForComparison(value);
  if (!normalized) return false;
  return CONNECTED_EXACT_URLS
    .map(normalizeUrlForComparison)
    .some((allowed) => allowed === normalized);
}

function isConnectedProfileUrl(value: string): boolean {
  const url = parseHttpUrl(value);
  if (!url) return false;

  return CONNECTED_PREFIX_URLS.some((allowedValue) => {
    const allowed = parseHttpUrl(allowedValue);
    if (!allowed || !hasSameOrigin(url, allowed)) return false;

    const allowedPath = normalizePathname(allowed.pathname);
    const candidatePath = normalizePathname(url.pathname);
    return candidatePath === allowedPath || candidatePath.startsWith(`${allowedPath}/`);
  });
}

export function isAllowedPostUrl(value: string): boolean {
  return isFirstPartyUrl(value) || isConnectedExactUrl(value) || isConnectedProfileUrl(value);
}

export function tokenRadarUrl(pathname = "/"): string {
  const base = SITE_URL.replace(/\/+$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
}

export function sanitizePostTextLinks(text: string): string {
  let next = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi,
    (match, label: string, url: string) => isAllowedPostUrl(url) ? match : label,
  );

  next = next.replace(
    /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
    (match, _quote: string, href: string, label: string) => isAllowedPostUrl(href) ? match : label,
  );

  next = next.replace(HTTP_URL_PATTERN, (rawUrl: string) => {
    const { url, trailing } = splitTrailingPunctuation(rawUrl);
    return isAllowedPostUrl(url) ? `${url}${trailing}` : trailing;
  });

  return normalizeWhitespace(next);
}

export function sanitizeTelegramPostLinks(html: string): string {
  return sanitizePostTextLinks(html);
}
