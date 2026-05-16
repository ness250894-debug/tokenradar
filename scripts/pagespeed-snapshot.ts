import { existsSync } from "fs";
import { resolve } from "path";
import * as dotenv from "dotenv";

loadLocalEnv();

type Strategy = "mobile" | "desktop";

type LighthouseCategory = {
  score?: number | null;
};

type LighthouseAudit = {
  displayValue?: string;
  numericValue?: number;
};

type PageSpeedResponse = {
  id?: string;
  lighthouseResult?: {
    categories?: Record<string, LighthouseCategory>;
    audits?: Record<string, LighthouseAudit>;
  };
  error?: {
    message?: string;
  };
};

const endpoint = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

const url = process.env.PAGESPEED_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
const apiKey = process.env.PAGESPEED_API_KEY || "";
const strategies = parseStrategies(process.env.PAGESPEED_STRATEGIES || "mobile,desktop");

const thresholds = {
  performance: parseThreshold("PAGESPEED_MIN_PERFORMANCE", 0.6),
  accessibility: parseThreshold("PAGESPEED_MIN_ACCESSIBILITY", 0.85),
  "best-practices": parseThreshold("PAGESPEED_MIN_BEST_PRACTICES", 0.8),
  seo: parseThreshold("PAGESPEED_MIN_SEO", 0.85),
};

const categories = Object.keys(thresholds);
const auditsToPrint = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "speed-index",
  "total-byte-weight",
];

let hasFailure = false;

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (!apiKey && /quota/i.test(message)) {
    console.error("Set PAGESPEED_API_KEY to use a project-specific free PageSpeed Insights quota.");
  }
  process.exitCode = 1;
});

async function main(): Promise<void> {
  for (const strategy of strategies) {
    const result = await runPageSpeed(url, strategy);
    const lighthouse = result.lighthouseResult;

    if (!lighthouse?.categories) {
      hasFailure = true;
      console.error(`PageSpeed ${strategy} returned no Lighthouse categories.`);
      continue;
    }

    console.log(`\nPageSpeed snapshot for ${url} (${strategy})`);
    for (const category of categories) {
      const score = lighthouse.categories[category]?.score;
      const minimum = thresholds[category as keyof typeof thresholds];

      if (typeof score !== "number") {
        hasFailure = true;
        console.error(`- ${category}: missing score`);
        continue;
      }

      const status = score >= minimum ? "pass" : "fail";
      console.log(`- ${category}: ${formatScore(score)} (${status}, minimum ${formatScore(minimum)})`);
      if (score < minimum) hasFailure = true;
    }

    if (lighthouse.audits) {
      console.log("Key audits:");
      for (const auditId of auditsToPrint) {
        const audit = lighthouse.audits[auditId];
        if (!audit) continue;
        const value = audit.displayValue || formatNumericValue(audit.numericValue);
        console.log(`- ${auditId}: ${value}`);
      }
    }
  }

  if (hasFailure) {
    process.exitCode = 1;
  }
}


function parseStrategies(value: string): Strategy[] {
  const parsed = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const strategies = parsed.filter((item): item is Strategy => item === "mobile" || item === "desktop");
  return strategies.length > 0 ? strategies : ["mobile", "desktop"];
}

function parseThreshold(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

async function runPageSpeed(targetUrl: string, strategy: Strategy): Promise<PageSpeedResponse> {
  const params = new URLSearchParams({
    url: targetUrl,
    strategy,
  });

  for (const category of categories) {
    params.append("category", category);
  }

  if (apiKey) params.set("key", apiKey);

  const response = await fetch(`${endpoint}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });

  const body = (await response.json()) as PageSpeedResponse;
  if (!response.ok) {
    throw new Error(body.error?.message || `PageSpeed request failed with HTTP ${response.status}`);
  }

  return body;
}

function formatScore(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatNumericValue(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return String(Math.round(value));
}

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, quiet: true });
  }
}
