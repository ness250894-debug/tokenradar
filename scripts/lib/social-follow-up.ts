import fs from "fs";
import path from "path";
import { executeD1Query, hasD1Config } from "../../src/lib/d1-client";
import { formatPrice } from "../../src/lib/formatters";
import { parseResearchSnapshot, createResearchSnapshot, type SocialResearchSnapshot } from "../../src/lib/social-research-snapshot";
import { safeReadJson } from "../../src/lib/utils";

export type ResearchCohortEntry = {
  contentKey: string;
  postedAt: string;
  snapshot: SocialResearchSnapshot;
};

export type ResearchFollowUp = ResearchCohortEntry & {
  current?: SocialResearchSnapshot;
  returnPercent?: number;
};

type HistoryRow = { content_key: string; posted_at: string; details_json: string | null };
const DAY = 86_400_000;

/** Freeze the earliest three distinct assets from the prior observation week before looking at outcomes. */
export function selectResearchCohort(rows: HistoryRow[], now: Date): ResearchCohortEntry[] {
  const seen = new Set<string>();
  const cohort: ResearchCohortEntry[] = [];
  const datedRows = rows.map((row) => ({ row, posted: Date.parse(row.posted_at) }))
    .filter(({ posted }) => posted >= now.getTime() - 14 * DAY && posted <= now.getTime() - 7 * DAY)
    .sort((a, b) => a.posted - b.posted || a.row.content_key.localeCompare(b.row.content_key));
  for (const { row, posted } of datedRows) {
    let details: Record<string, unknown>;
    try { details = JSON.parse(row.details_json || "{}"); } catch { continue; }
    if (!details || typeof details !== "object" || details.editorialMode === "research-follow-up"
      || /video|reel/.test(String(details.variantSurface || ""))) continue;
    const snapshot = parseResearchSnapshot(details.researchSnapshot);
    if (!snapshot || seen.has(snapshot.tokenId)) continue;
    const observed = Date.parse(snapshot.marketDataAsOf);
    if (observed > posted + 5 * 60_000 || posted - observed > DAY) continue;
    seen.add(snapshot.tokenId);
    cohort.push({ contentKey: row.content_key, postedAt: row.posted_at, snapshot });
    if (cohort.length === 3) break;
  }
  return cohort;
}

export async function loadResearchCohort(dataDir: string, platform: "telegram" | "threads" | "x", now = new Date()): Promise<ResearchCohortEntry[]> {
  if (hasD1Config()) {
    try {
      const result = await executeD1Query<HistoryRow>(
        "SELECT content_key, posted_at, details_json FROM social_posts WHERE platform = ? AND posted_at >= ? AND posted_at <= ? ORDER BY posted_at ASC, content_key ASC LIMIT 100",
        [platform, new Date(now.getTime() - 14 * DAY).toISOString(), new Date(now.getTime() - 7 * DAY).toISOString()],
      );
      return selectResearchCohort(result.flatMap((item) => item.results || []), now);
    } catch {
      console.warn("Research follow-up history unavailable in D1; checking cached published observations.");
    }
  }
  const rows: HistoryRow[] = [];
  for (let age = 7; age <= 14; age++) {
    const dir = path.join(dataDir, "posted", new Date(now.getTime() - age * DAY).toISOString().slice(0, 10));
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      const record = safeReadJson<Record<string, unknown> | null>(path.join(dir, file), null);
      if (!record || record.platform !== platform || !record.externalId || typeof record.postedAt !== "string") continue;
      rows.push({ content_key: file, posted_at: record.postedAt, details_json: JSON.stringify(record) });
    }
  }
  return selectResearchCohort(rows, now);
}

export function evaluateResearchCohort(
  cohort: ResearchCohortEntry[],
  candidates: Parameters<typeof createResearchSnapshot>[0][],
  now: Date,
): ResearchFollowUp[] {
  return cohort.map((entry) => {
    const candidate = candidates.find((item) => item.id === entry.snapshot.tokenId);
    const current = candidate && createResearchSnapshot(candidate);
    if (!current || Date.parse(current.marketDataAsOf) <= Date.parse(entry.snapshot.marketDataAsOf)
      || Date.parse(current.marketDataAsOf) > now.getTime() + 5 * 60_000
      || now.getTime() - Date.parse(current.marketDataAsOf) > DAY) return { ...entry };
    const returnPercent = (current.price / entry.snapshot.price - 1) * 100;
    return Number.isFinite(returnPercent) ? { ...entry, current, returnPercent } : { ...entry };
  });
}

export function buildResearchFollowUpText(items: ResearchFollowUp[], maxChars: number): string {
  if (!items.length) throw new Error("A follow-up requires a recorded cohort.");
  const lines = (withPrices: boolean) => items.map(({ snapshot, current, returnPercent }) => {
    const baseline = snapshot.marketDataAsOf.slice(0, 16).replace("T", " ");
    return current && returnPercent !== undefined
      ? `$${snapshot.symbol}: ${returnPercent >= 0 ? "+" : ""}${returnPercent.toFixed(2)}% since ${baseline} UTC${withPrices ? ` (${formatPrice(snapshot.price)} → ${formatPrice(current.price)})` : ""}.`
      : `$${snapshot.symbol}: fresh same-source price unavailable. Baseline ${withPrices ? `${formatPrice(snapshot.price)} at ` : ""}${baseline} UTC.`;
  });
  const { first, last } = getFollowUpEndpointTimes(items);
  const source = first && last
    ? `CoinGecko ${first === last ? "endpoint" : "oldest endpoint"}, ${first.slice(0, 16).replace("T", " ")} UTC.`
    : "No fresh endpoint prices available.";
  const title = items.length === 1 ? "Revisiting the original price" : "Research follow-up";
  for (const withPrices of [true, false]) {
    const text = [title, ...lines(withPrices), source].join("\n");
    if (text.length <= maxChars) return text;
  }
  throw new Error("The full research cohort does not fit; hold for a longer format.");
}

export function getFollowUpEndpointTimes(items: ResearchFollowUp[]): { first?: string; last?: string } {
  const times = items.flatMap((item) => item.current ? [item.current.marketDataAsOf] : []).sort();
  return { first: times[0], last: times.at(-1) };
}
