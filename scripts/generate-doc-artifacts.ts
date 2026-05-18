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

export function generateDocArtifacts(doc: string): { jsonPath: string; htmlPath: string; json: string; html: string } {
  const existing = readExistingArtifact(doc);
  const docDir = path.resolve(process.cwd(), "docs", doc);
  const jsonPath = path.join(docDir, `${doc}.json`);
  const htmlPath = path.join(docDir, `${doc}.html`);
  const artifact = buildMarkdownDocumentArtifact({
    name: existing.name,
    title: existing.title,
    rawMarkdown: existing.rawMarkdown,
    sourcePath: existing.sourcePath,
    sourceStatus: existing.sourceStatus,
    htmlArtifact: existing.htmlArtifact,
    jsonArtifact: existing.jsonArtifact,
    updatedAt: existing.updatedAt,
    version: existing.version,
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
