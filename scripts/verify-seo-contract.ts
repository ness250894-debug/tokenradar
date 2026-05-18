/**
 * Local verification for SEO contract support files that are not covered by Next build output.
 */
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import { buildMarkdownDocumentArtifact } from "../src/lib/doc-artifacts";
import { collectIndexNowUrlsFromPublicDir } from "../src/lib/indexnow";
import { buildRobotsText } from "../src/lib/robots-policy";

interface VerificationFailure {
  id: string;
  message: string;
}

function verifySeoDocs(): VerificationFailure[] {
  const jsonPath = path.resolve(process.cwd(), "docs", "seo", "seo.json");
  if (!fs.existsSync(jsonPath)) {
    return [{ id: "docs-seo", message: "docs/seo/seo.json is missing." }];
  }

  const current = JSON.parse(fs.readFileSync(jsonPath, "utf-8").replace(/^\uFEFF/, "")) as {
    name: string;
    title: string;
    rawMarkdown: string;
    sourcePath: string | null;
    sourceStatus?: string;
    htmlArtifact: string;
    jsonArtifact: string;
    updatedAt: string;
    version: number;
    stats: unknown;
    headings: unknown;
    sections: unknown;
  };
  const rebuilt = buildMarkdownDocumentArtifact({
    name: current.name,
    title: current.title,
    rawMarkdown: current.rawMarkdown,
    sourcePath: current.sourcePath,
    sourceStatus: current.sourceStatus,
    htmlArtifact: current.htmlArtifact,
    jsonArtifact: current.jsonArtifact,
    updatedAt: current.updatedAt,
    version: current.version,
  });

  const failures: VerificationFailure[] = [];
  if (JSON.stringify(current.stats) !== JSON.stringify(rebuilt.stats)) {
    failures.push({ id: "docs-seo-stats", message: "docs/seo/seo.json stats do not match rawMarkdown." });
  }
  if (JSON.stringify(current.headings) !== JSON.stringify(rebuilt.headings)) {
    failures.push({ id: "docs-seo-headings", message: "docs/seo/seo.json headings do not match rawMarkdown." });
  }
  if (JSON.stringify(current.sections) !== JSON.stringify(rebuilt.sections)) {
    failures.push({ id: "docs-seo-sections", message: "docs/seo/seo.json sections do not match rawMarkdown." });
  }
  return failures;
}

function verifyRobotsFallback(): VerificationFailure[] {
  const robotsPath = path.resolve(process.cwd(), "public", "robots.txt");
  const expected = buildRobotsText("https://tokenradar.co").replace(/\r\n/g, "\n").trim();
  const actual = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, "utf-8").replace(/\r\n/g, "\n").trim() : "";
  return actual === expected
    ? []
    : [{ id: "robots-sync", message: "public/robots.txt does not match the shared robots policy." }];
}

function verifyIndexNowUrls(): VerificationFailure[] {
  const urls = collectIndexNowUrlsFromPublicDir(path.resolve(process.cwd(), "public"));
  const sitemapChunkUrls = urls.filter((url) => /\/sitemap-[^/]+\.xml$/i.test(url));
  return sitemapChunkUrls.length === 0
    ? []
    : [{ id: "indexnow-pages", message: "IndexNow URL collection returned sitemap chunk URLs instead of page URLs." }];
}

export function verifySeoContract(): VerificationFailure[] {
  return [
    ...verifySeoDocs(),
    ...verifyRobotsFallback(),
    ...verifyIndexNowUrls(),
  ];
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href;
}

if (isDirectExecution()) {
  const failures = verifySeoContract();
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`${failure.id}: ${failure.message}`);
    }
    process.exit(1);
  }
  console.log("SEO contract support files verified.");
}
