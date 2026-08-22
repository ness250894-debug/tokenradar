import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import worker, {
  GLOBAL_SECURITY_HEADERS,
  shouldNoIndexTextPayload,
} from "../public/_worker.js";
import { generateXml } from "../scripts/generate-sitemap";
import { acquireProcessLock, isProcessProbablyRunning } from "../scripts/process-lock";
import { buildTokenSourceLinks, formatSnapshotDate } from "../src/components/TokenSources";
import {
  isProductionCanonicalSiteUrl,
  PRODUCTION_SITE_ORIGIN,
} from "../src/lib/canonical-origin";
import { buildOpenGraphMetadata } from "../src/lib/share-metadata";

const temporaryDirectories: string[] = [];

function makeLockPath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-process-lock-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "index-status.lock");
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("technical SEO fixes", () => {
  it("escapes page and image URLs in generated sitemap XML", () => {
    const xml = generateXml([
      {
        url: "/asset?network=eth&view=full",
        lastmod: "2026-08-22",
        images: [
          {
            loc: "https://images.example/token.png?width=1200&format=png",
            title: "Asset & chart",
          },
        ],
      },
    ]);

    expect(xml).toContain("https://tokenradar.co/asset?network=eth&amp;view=full");
    expect(xml).toContain("https://images.example/token.png?width=1200&amp;format=png");
    expect(xml).toContain("<image:title>Asset &amp; chart</image:title>");
  });

  it("accepts only the production canonical site origin", () => {
    expect(isProductionCanonicalSiteUrl(PRODUCTION_SITE_ORIGIN)).toBe(true);
    expect(isProductionCanonicalSiteUrl(`${PRODUCTION_SITE_ORIGIN}/`)).toBe(true);
    expect(isProductionCanonicalSiteUrl("http://tokenradar.co")).toBe(false);
    expect(isProductionCanonicalSiteUrl("https://www.tokenradar.co")).toBe(false);
    expect(isProductionCanonicalSiteUrl("https://preview.tokenradar.pages.dev")).toBe(false);
    expect(isProductionCanonicalSiteUrl(`${PRODUCTION_SITE_ORIGIN}/preview`)).toBe(false);
    expect(isProductionCanonicalSiteUrl(` ${PRODUCTION_SITE_ORIGIN}`)).toBe(false);
    expect(isProductionCanonicalSiteUrl(`https://user@tokenradar.co`)).toBe(false);
  });

  it("builds complete Open Graph identity metadata", () => {
    expect(buildOpenGraphMetadata({
      title: "Bitcoin research",
      description: "Token research description",
      url: "/bitcoin",
    })).toMatchObject({
      url: "/bitcoin",
      siteName: "TokenRadar",
      locale: "en_US",
      type: "website",
    });
  });

  it("keeps only safe token source links and adds the CoinGecko record", () => {
    expect(buildTokenSourceLinks("bitcoin", {
      website: "https://bitcoin.org",
      github: "javascript:alert(1)",
      explorer: "not a URL",
      reddit: "https://www.reddit.com/r/Bitcoin/",
    })).toEqual([
      { label: "Official website", href: "https://bitcoin.org/" },
      { label: "Reddit community", href: "https://www.reddit.com/r/Bitcoin/" },
      { label: "CoinGecko market page", href: "https://www.coingecko.com/en/coins/bitcoin" },
    ]);
  });

  it("formats the market snapshot date in UTC", () => {
    expect(formatSnapshotDate("2026-08-22T22:30:00.000Z")).toEqual({
      dateTime: "2026-08-22T22:30:00.000Z",
      label: "August 22, 2026",
    });
  });

  it("redirects www requests to the HTTPS apex while preserving path and query", async () => {
    const assetFetch = vi.fn();
    const response = await worker.fetch(
      new Request("http://www.tokenradar.co/bitcoin?ref=test"),
      { ASSETS: { fetch: assetFetch } },
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://tokenradar.co/bitcoin?ref=test");
    expect(assetFetch).not.toHaveBeenCalled();
  });

  it("adds X-Robots-Tag to exported RSC text payloads but not public text files", async () => {
    expect(shouldNoIndexTextPayload("/bitcoin.txt")).toBe(true);
    expect(shouldNoIndexTextPayload("/bitcoin/how-to-buy.txt")).toBe(true);
    expect(shouldNoIndexTextPayload("/robots.txt")).toBe(false);
    expect(shouldNoIndexTextPayload("/c7a4b0d8e2f143a9b5c2d8f1e4a7b0d8.txt")).toBe(false);

    const assetFetch = vi.fn(async () => new Response("RSC payload", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    }));
    const response = await worker.fetch(
      new Request("https://tokenradar.co/bitcoin.txt"),
      { ASSETS: { fetch: assetFetch } },
    );

    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, nosnippet");
    expect(await response.text()).toBe("RSC payload");
  });

  it("preserves global security and HTML cache headers on worker-routed documents", async () => {
    const headersFile = fs.readFileSync(
      path.join(process.cwd(), "public", "_headers"),
      "utf-8",
    );
    const assetFetch = vi.fn(async () => new Response("<!doctype html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }));
    const response = await worker.fetch(
      new Request("https://tokenradar.co/bitcoin"),
      { ASSETS: { fetch: assetFetch } },
    );

    for (const [name, value] of Object.entries(GLOBAL_SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
      expect(headersFile).toContain(`${name}: ${value}`);
    }
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, stale-while-revalidate=86400",
    );
  });

  it("routes documents and RSC payloads through the worker while excluding immutable assets", () => {
    const routes = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "_routes.json"), "utf-8"),
    ) as { include: string[]; exclude: string[] };

    expect(routes.include).toEqual(["/*"]);
    expect(routes.exclude).toContain("/_next/static/*");
    expect(routes.exclude).toContain("/data/*");
    expect(routes.exclude).toContain("/.well-known/*");
    expect(routes.exclude).not.toContain("/*.txt");
  });
});

describe("index-status process lock", () => {
  it("acquires exclusively and removes only its own lock on release", () => {
    const lockPath = makeLockPath();
    const release = acquireProcessLock(lockPath);

    expect(() => acquireProcessLock(lockPath)).toThrow(
      `Another index-status export is already running with PID ${process.pid}.`,
    );
    expect(fs.existsSync(lockPath)).toBe(true);

    release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("preserves a stale lock for explicit operator cleanup", () => {
    const lockPath = makeLockPath();
    const staleLock = `${JSON.stringify({
      pid: 12345,
      token: "stale-owner",
      createdAt: "2026-08-01T00:00:00.000Z",
    })}\n`;
    fs.writeFileSync(lockPath, staleLock);
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("missing"), { code: "ESRCH" });
    });

    expect(() => acquireProcessLock(lockPath)).toThrow("A stale index-status lock exists");
    expect(fs.readFileSync(lockPath, "utf-8")).toBe(staleLock);
  });

  it("does not remove a replacement lock owned by a different token", () => {
    const lockPath = makeLockPath();
    const release = acquireProcessLock(lockPath);
    const replacement = `${JSON.stringify({
      pid: process.pid,
      token: "replacement-owner",
      createdAt: new Date().toISOString(),
    })}\n`;
    fs.writeFileSync(lockPath, replacement);

    release();
    expect(fs.readFileSync(lockPath, "utf-8")).toBe(replacement);
  });

  it("treats a permission error as evidence that the process exists", () => {
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("denied"), { code: "EPERM" });
    });

    expect(isProcessProbablyRunning(12345)).toBe(true);
  });
});
