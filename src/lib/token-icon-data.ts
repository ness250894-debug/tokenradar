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

function getSupportedImageMimeType(bytes: Buffer): "image/png" | "image/jpeg" | "image/svg+xml" | null {
  if (bytes.length < 4) return null;

  // Check PNG signature: 89 50 4E 47
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4E &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  // Check JPEG signature: FF D8
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    return "image/jpeg";
  }

  // Check SVG signature (must contain '<svg' or '<?xml' in first 1024 bytes)
  try {
    const text = bytes.subarray(0, Math.min(bytes.length, 1024)).toString("utf8").trim();
    if (text.startsWith("<?xml") || text.includes("<svg") || text.includes("<SVG")) {
      return "image/svg+xml";
    }
  } catch {
    // Keep it safe if UTF-8 conversion fails
  }

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

        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_ICON_BYTES) {
          return undefined;
        }

        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) return undefined;

        const mimeType = getSupportedImageMimeType(bytes);
        if (!mimeType) return undefined;

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
