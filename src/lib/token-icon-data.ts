import {
  getTokenIconCandidates,
  type TokenIconCandidateInput,
} from "./formatters";

const ICON_FETCH_TIMEOUT_MS = 4500;
const MAX_ICON_BYTES = 512 * 1024;
const TRUSTED_ICON_HOSTS = new Set([
  "assets.coingecko.com",
  "cdn.jsdelivr.net",
  "coin-images.coingecko.com",
  "images.coingecko.com",
  "raw.githubusercontent.com",
  "static.coingecko.com",
]);
const tokenIconCache = new Map<string, Promise<string | undefined>>();

function isTrustedIconUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && TRUSTED_ICON_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function inferImageMimeType(url: string, contentType: string | null): string | null {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (normalized === "image/png" || normalized === "image/jpeg") {
    return normalized;
  }

  const pathname = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

async function fetchIconUrlAsDataUrl(url: string): Promise<string | undefined> {
  if (!isTrustedIconUrl(url)) {
    return undefined;
  }

  if (!tokenIconCache.has(url)) {
    tokenIconCache.set(url, (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return undefined;

        const mimeType = inferImageMimeType(url, response.headers.get("content-type"));
        if (!mimeType) return undefined;

        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_ICON_BYTES) {
          return undefined;
        }

        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) return undefined;

        return `data:${mimeType};base64,${bytes.toString("base64")}`;
      } catch {
        return undefined;
      } finally {
        clearTimeout(timeout);
      }
    })());
  }

  return tokenIconCache.get(url)!;
}

export async function fetchTokenIconDataUrl(input: TokenIconCandidateInput): Promise<string | undefined> {
  for (const url of getTokenIconCandidates(input)) {
    const dataUrl = await fetchIconUrlAsDataUrl(url);
    if (dataUrl) return dataUrl;
  }

  return undefined;
}
