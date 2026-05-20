import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { describe, expect, it } from "vitest";

import { buildMarkdownDocumentArtifact, renderDocumentHtml } from "../src/lib/doc-artifacts";
import { collectIndexNowUrlsFromPublicDir } from "../src/lib/indexnow";
import { buildRobotsText } from "../src/lib/robots-policy";
import { auditSeoHtml } from "../src/lib/seo-render-audit";
import { resolveHtmlPathForUrl } from "../scripts/seo-qa-check";

describe("SEO flow contract implementation", () => {
  it("keeps the SEO artifact source of record successfully ignored by git", () => {
    const result = spawnSync(
      "git",
      ["-c", "safe.directory=D:/tokenradar", "check-ignore", "--no-index", "docs/seo/seo.json"],
      { cwd: process.cwd(), encoding: "utf-8" },
    );

    expect(result.status).toBe(0);
  });

  it("can regenerate markdown document artifacts from raw markdown", () => {
    const artifact = buildMarkdownDocumentArtifact({
      name: "Fixture SEO Doc",
      title: "Fixture SEO Doc",
      rawMarkdown: "# Fixture SEO Doc\n\nIntro text.\n\n## 1. Section\n- One\n- Two\n",
      sourcePath: null,
      sourceStatus: "retired",
      htmlArtifact: "docs/fixture/fixture.html",
      jsonArtifact: "docs/fixture/fixture.json",
      updatedAt: "2026-05-18",
      version: 2,
    });

    expect(artifact.stats.headingCount).toBe(2);
    expect(artifact.sections).toHaveLength(2);
    expect(artifact.sections[1].heading).toBe("1. Section");

    const html = renderDocumentHtml(artifact, {
      jsonFilename: "fixture.json",
      sourceLabel: "docs/fixture",
    });

    expect(html).toContain("<title>Fixture SEO Doc - TokenRadar Docs</title>");
    expect(html).toContain("Artifact-maintained source of record");
    expect(html).toContain("href=\"fixture.json\"");
    expect(html).toContain("id=\"1-section\"");
  });

  it("keeps the public robots fallback synchronized with the shared robots policy", () => {
    const publicRobots = fs.readFileSync(path.join(process.cwd(), "public", "robots.txt"), "utf-8");
    expect(publicRobots.replace(/\r\n/g, "\n").trim()).toBe(buildRobotsText("https://tokenradar.co").trim());
  });

  it("expands sitemap indexes before submitting IndexNow page URLs", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-indexnow-"));
    const publicDir = path.join(tmpRoot, "public");
    fs.mkdirSync(publicDir, { recursive: true });

    try {
      fs.writeFileSync(
        path.join(publicDir, "sitemap.xml"),
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          "<sitemap><loc>https://tokenradar.co/sitemap-main.xml</loc></sitemap>",
          "<sitemap><loc>https://tokenradar.co/sitemap-tokens.xml</loc></sitemap>",
          "</sitemapindex>",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(publicDir, "sitemap-main.xml"),
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          "<url><loc>https://tokenradar.co/</loc></url>",
          "<url><loc>https://tokenradar.co/about</loc></url>",
          "</urlset>",
        ].join("\n"),
      );
      fs.writeFileSync(
        path.join(publicDir, "sitemap-tokens.xml"),
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          "<url><loc>https://tokenradar.co/bitcoin</loc></url>",
          "</urlset>",
        ].join("\n"),
      );

      expect(collectIndexNowUrlsFromPublicDir(publicDir)).toEqual([
        "https://tokenradar.co/",
        "https://tokenradar.co/about",
        "https://tokenradar.co/bitcoin",
      ]);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("resolves Next static export HTML files emitted in flat and nested forms", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-seo-out-"));

    try {
      fs.writeFileSync(path.join(tmpRoot, "tokens.html"), "<!doctype html>");
      fs.mkdirSync(path.join(tmpRoot, "category", "defi"), { recursive: true });
      fs.writeFileSync(path.join(tmpRoot, "category", "defi", "index.html"), "<!doctype html>");

      expect(resolveHtmlPathForUrl(tmpRoot, "https://tokenradar.co/")).toBe(path.join(tmpRoot, "index.html"));
      expect(resolveHtmlPathForUrl(tmpRoot, "https://tokenradar.co/tokens")).toBe(path.join(tmpRoot, "tokens.html"));
      expect(resolveHtmlPathForUrl(tmpRoot, "https://tokenradar.co/category/defi")).toBe(
        path.join(tmpRoot, "category", "defi", "index.html"),
      );
      expect(resolveHtmlPathForUrl(tmpRoot, "https://tokenradar.co/missing")).toBe(
        path.join(tmpRoot, "missing", "index.html"),
      );
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("audits rendered HTML for SEO checklist fields", () => {
    const html = [
      "<!doctype html><html><head>",
      "<title>Bitcoin Analysis | TokenRadar</title>",
      '<meta name="description" content="Data-driven Bitcoin analysis." />',
      '<link rel="canonical" href="https://tokenradar.co/bitcoin" />',
      '<meta property="og:title" content="Bitcoin Analysis" />',
      '<meta property="og:description" content="Data-driven Bitcoin analysis." />',
      '<meta property="og:image" content="https://tokenradar.co/og/token/bitcoin.png" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article"}</script>',
      "</head><body><a href=\"/ethereum\">Ethereum</a></body></html>",
    ].join("");

    const result = auditSeoHtml({
      html,
      url: "https://tokenradar.co/bitcoin",
      sitemapUrls: new Set(["https://tokenradar.co/bitcoin"]),
      expectedIndexable: true,
    });

    expect(result.passed).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);

    const missingCanonical = auditSeoHtml({
      html: html.replace(/<link rel="canonical"[^>]+>/, ""),
      url: "https://tokenradar.co/bitcoin",
      sitemapUrls: new Set(["https://tokenradar.co/bitcoin"]),
      expectedIndexable: true,
    });

    expect(missingCanonical.passed).toBe(false);
    expect(missingCanonical.checks).toContainEqual(
      expect.objectContaining({ id: "canonical", passed: false }),
    );
  });
});
