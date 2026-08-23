/**
 * Regenerate a Markdown document artifact pair from the rawMarkdown stored in its JSON file.
 */
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import {
  buildMarkdownDocumentArtifact,
  renderDocumentHtml,
  type MarkdownDocumentArtifact,
} from "../src/lib/doc-artifacts";
import { getSocialPublishingManifest } from "../src/lib/social-publishing-manifest";

interface CliOptions {
  doc: string;
  check: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let doc = "seo";
  let check = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--doc" && argv[index + 1]) {
      doc = argv[index + 1];
      index += 1;
    } else if (arg === "--check") {
      check = true;
    }
  }

  return { doc, check };
}

function readExistingArtifact(doc: string): MarkdownDocumentArtifact {
  const jsonPath = path.resolve(process.cwd(), "docs", doc, `${doc}.json`);
  return JSON.parse(fs.readFileSync(jsonPath, "utf-8").replace(/^\uFEFF/, "")) as MarkdownDocumentArtifact;
}

function stableJson(value: MarkdownDocumentArtifact): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function resolveRawMarkdown(existing: MarkdownDocumentArtifact): string {
  const sourcePath = existing.sourcePath?.trim();
  if (!sourcePath || sourcePath.endsWith("#rawMarkdown")) return existing.rawMarkdown;

  return fs.readFileSync(path.resolve(process.cwd(), sourcePath), "utf-8").replace(/^\uFEFF/, "");
}

function synchronizeDynamicInventory(doc: string, rawMarkdown: string): string {
  if (doc === "automations") return synchronizeAutomationRunbook(rawMarkdown);
  if (doc !== "testing") return rawMarkdown;
  const testsDir = path.resolve(process.cwd(), "tests");
  const testFileCount = fs.readdirSync(testsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .length;
  return rawMarkdown.replace(
    /The repository currently has \d+ Vitest files/g,
    `The repository currently has ${testFileCount} Vitest files`,
  );
}

function replaceMarkdownSection(rawMarkdown: string, heading: string, replacement: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^## ${escaped}\\n[\\s\\S]*?(?=^## |$(?![\\s\\S]))`, "m");
  return pattern.test(rawMarkdown)
    ? rawMarkdown.replace(pattern, replacement.trimEnd() + "\n\n")
    : `${rawMarkdown.trimEnd()}\n\n${replacement.trimEnd()}\n`;
}

function synchronizeAutomationRunbook(rawMarkdown: string): string {
  const manifest = getSocialPublishingManifest();
  const workflowCount = fs.readdirSync(path.resolve(process.cwd(), ".github/workflows"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name)).length;
  let synchronized = rawMarkdown.replace(
    /The repository currently has (?:seven|\d+) GitHub Actions workflows:/,
    `The repository currently has ${workflowCount} GitHub Actions workflows:`,
  );

  if (!synchronized.includes("`.github/workflows/social-runner-recovery.yml`")) {
    synchronized = synchronized.replace(
      "\n## Social Workflow",
      [
        "- `.github/workflows/social-runner-recovery.yml`",
        "  Purpose: re-run social jobs only when GitHub failed before assigning a runner; genuine publishing failures remain manual to avoid duplicates.",
        "  Triggers: failed Social Automations completions, a `13,33,53 * * * *` safety sweep, and manual dispatch.",
        "- `.github/workflows/seo-maintenance.yml`",
        "  Purpose: export GA4/Search Console evidence, audit indexing, and generate zero-AI SEO maintenance recommendations.",
        "  Schedule: `04:15 UTC Sunday`, plus manual dispatch.",
        "",
        "## Social Workflow",
      ].join("\n"),
    );
  }

  synchronized = replaceMarkdownSection(synchronized, "Social Workflow", [
    "## Social Workflow",
    "",
    `Social publishing is declared in \`config/social-publishing.json\` version ${manifest.version}. The generated calendar and dedicated runbook are \`docs/editorial/social-rotation-calendar.md\` and \`docs/automations/social-publishing-runbook.md\`.`,
    "",
    "The reduced route set is:",
    "",
    ...manifest.routes.map((route) => `- \`${route.cron}\` — ${route.platform}/${route.format}: \`${route.command}\``),
    "",
    "TikTok is intentionally paused. Platform routes run independently so one API failure does not suppress another platform, and scheduled posts use durable delivery reservations before external publication.",
  ].join("\n"));

  synchronized = replaceMarkdownSection(synchronized, "Social Tracking and Ops Ledger", [
    "## Social Tracking and Ops Ledger",
    "",
    "D1 is the authoritative social delivery and measurement store. A delivery moves through planned, publishing, published, failed, or outcome_unknown; uncertain external writes are reconciled before retrying.",
    "",
    `Native metrics are collected at ${manifest.measurement.windowsHours.map((hours) => `+${hours}h`).join(" and ")} by \`npm run social:metrics:collect\` on \`${manifest.measurement.collectionCron}\`. The weekly normalized report runs on \`${manifest.measurement.weeklyReportCron}\` through \`npm run social:metrics:report\`.`,
    "",
    "Trackers distinguish `plannedUrl` from `publishedUrl` and preserve `utm_content`. X, Instagram, Threads, and YouTube have native collectors. Telegram per-post views are unavailable through Bot API and TikTok is paused, so no fabricated values are written.",
  ].join("\n"));

  return synchronized;
}

export function generateDocArtifacts(doc: string): { jsonPath: string; htmlPath: string; json: string; html: string } {
  const existing = readExistingArtifact(doc);
  const docDir = path.resolve(process.cwd(), "docs", doc);
  const jsonPath = path.join(docDir, `${doc}.json`);
  const htmlPath = path.join(docDir, `${doc}.html`);
  const artifact = buildMarkdownDocumentArtifact({
    name: existing.name,
    title: existing.title,
    rawMarkdown: synchronizeDynamicInventory(doc, resolveRawMarkdown(existing)),
    sourcePath: existing.sourcePath,
    sourceStatus: existing.sourceStatus,
    htmlArtifact: existing.htmlArtifact,
    jsonArtifact: existing.jsonArtifact,
    updatedAt: doc === "automations" ? getSocialPublishingManifest().updatedAt : existing.updatedAt,
    version: doc === "automations" ? Math.max(existing.version, getSocialPublishingManifest().version) : existing.version,
  });

  return {
    jsonPath,
    htmlPath,
    json: stableJson(artifact),
    html: renderDocumentHtml(artifact, {
      jsonFilename: `${doc}.json`,
      sourceLabel: `docs/${doc}`,
    }),
  };
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href;
}

if (isDirectExecution()) {
  const options = parseArgs(process.argv.slice(2));
  const generated = generateDocArtifacts(options.doc);

  if (options.check) {
    const currentJson = fs.readFileSync(generated.jsonPath, "utf-8").replace(/\r\n/g, "\n");
    const currentHtml = fs.readFileSync(generated.htmlPath, "utf-8").replace(/\r\n/g, "\n");
    if (currentJson !== generated.json || currentHtml !== generated.html) {
      console.error(`docs/${options.doc} artifacts are out of date. Run npm run docs:${options.doc}.`);
      process.exit(1);
    }
    console.log(`docs/${options.doc} artifacts are current.`);
  } else {
    fs.writeFileSync(generated.jsonPath, generated.json);
    fs.writeFileSync(generated.htmlPath, generated.html);
    console.log(`Regenerated docs/${options.doc}/${options.doc}.json and docs/${options.doc}/${options.doc}.html.`);
  }
}
