import { formatErrorForLog } from "./utils";

export interface TgeRssFeedRef {
  name: string;
  url: string;
}

const SKIPPABLE_STATUS_CODES = new Set([401, 403, 404, 410]);

function extractStatusCode(error: unknown): number | null {
  const message = formatErrorForLog(error);
  const match = message.match(/\b(?:Status code|HTTP Error:)\s+(\d{3})\b/i);
  if (!match) return null;

  const status = Number(match[1]);
  return Number.isFinite(status) ? status : null;
}

export function isSkippableTgeRssFetchError(error: unknown): boolean {
  const status = extractStatusCode(error);
  return status !== null && SKIPPABLE_STATUS_CODES.has(status);
}

export function formatTgeRssErrorSource(feed: TgeRssFeedRef): string {
  const slug = feed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `discover-tges-rss:${slug || "unknown"}`;
}

export function createTgeRssReportError(feed: TgeRssFeedRef, error: unknown): Error {
  return new Error(`${feed.name} RSS fetch failed (${feed.url}): ${formatErrorForLog(error)}`);
}
