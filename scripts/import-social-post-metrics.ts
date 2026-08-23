import * as fs from "fs";
import * as path from "path";

import {
  recordSocialPostMetrics,
  validateSocialPostMetricsRecord,
  type SocialPostMetricsRecord,
} from "../src/lib/ops-ledger";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

type RawMetricsRecord = Record<string, unknown>;

const NUMBER_FIELDS: Array<keyof SocialPostMetricsRecord> = [
  "impressions",
  "views",
  "likes",
  "replies",
  "comments",
  "reposts",
  "shares",
  "saves",
  "linkClicks",
  "profileClicks",
  "watchTimeSeconds",
  "completionRate",
];

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      i += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsv(raw: string): RawMetricsRecord[] {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function normalizeRecord(record: RawMetricsRecord): SocialPostMetricsRecord {
  const platform = stringValue(record.platform);
  const contentKey = stringValue(record.contentKey) || stringValue(record.content_key);
  if (!platform || !contentKey) {
    throw new Error("Each metrics record requires platform and contentKey/content_key.");
  }

  const normalized: SocialPostMetricsRecord = {
    platform,
    contentKey,
    measuredAt: stringValue(record.measuredAt) || stringValue(record.measured_at),
    horizonHours: parseNumber(record.horizonHours) ?? parseNumber(record.horizon_hours) ?? parseNumber(record.window_hours),
    details: {},
  };

  if (normalized.horizonHours === undefined) {
    throw new Error(`Metrics record ${platform}/${contentKey} requires horizonHours/window_hours.`);
  }
  if (!normalized.measuredAt) {
    throw new Error(`Metrics record ${platform}/${contentKey} requires measuredAt/measured_at.`);
  }

  for (const field of NUMBER_FIELDS) {
    const snakeField = field.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
    const rawValue = record[field] ?? record[snakeField];
    const parsedValue = parseNumber(rawValue);
    if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() && parsedValue === undefined) {
      throw new Error(`Metrics record ${platform}/${contentKey} has an invalid ${field} value.`);
    }
    (normalized as unknown as Record<string, unknown>)[field] = parsedValue;
  }

  normalized.details = Object.fromEntries(
    Object.entries(record).filter(([key]) => ![
      "platform",
      "contentKey",
      "content_key",
      "measuredAt",
      "measured_at",
      "horizonHours",
      "horizon_hours",
      "window_hours",
      ...NUMBER_FIELDS,
      ...NUMBER_FIELDS.map((field) => field.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)),
    ].includes(key)),
  );

  normalized.details = {
    ...(normalized.details || {}),
    collector: "manual-import",
  };
  validateSocialPostMetricsRecord(normalized);
  return normalized;
}

export function parseMetricsRecords(filePath: string): SocialPostMetricsRecord[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const extension = path.extname(filePath).toLowerCase();
  const parsed = extension === ".csv"
    ? parseCsv(raw)
    : JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Metrics file must contain an array of records.");
  }

  return parsed.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error("Metrics file contains a non-object record.");
    }
    return normalizeRecord(record as RawMetricsRecord);
  });
}

export async function importSocialPostMetrics(filePath: string): Promise<number> {
  const records = parseMetricsRecords(filePath);
  for (const record of records) {
    await recordSocialPostMetrics(record);
  }
  return records.length;
}

async function main(): Promise<void> {
  const filePath = argValue(process.argv, "--file");
  if (!filePath) {
    throw new Error("Usage: npx tsx scripts/import-social-post-metrics.ts --file data/social-metrics/example.json");
  }

  const count = await importSocialPostMetrics(path.resolve(process.cwd(), filePath));
  console.log(`Imported ${count} social post metric record(s).`);
}

const isEntryPoint = process.argv[1]?.endsWith("import-social-post-metrics.ts");
if (isEntryPoint) {
  main().catch((error) => {
    console.error(`Social post metrics import failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  });
}
