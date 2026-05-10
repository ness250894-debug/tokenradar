import {
  getTokenIconCandidates,
  type TokenIconCandidateInput,
} from "./formatters";

const ICON_FETCH_TIMEOUT_MS = 4500;
const tokenIconCache = new Map<string, Promise<string | undefined>>();

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
  if (!tokenIconCache.has(url)) {
    tokenIconCache.set(url, (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return undefined;

        const mimeType = inferImageMimeType(url, response.headers.get("content-type"));
        if (!mimeType) return undefined;

        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === 0) return undefined;

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
