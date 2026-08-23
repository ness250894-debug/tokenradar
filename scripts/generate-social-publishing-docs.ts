import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import {
  getSocialPublishingManifest,
  renderSocialPublishingRunbook,
  renderSocialRotationCalendar,
} from "../src/lib/social-publishing-manifest";

interface GeneratedDocument {
  filePath: string;
  content: string;
}

export function generateSocialPublishingDocuments(): GeneratedDocument[] {
  const manifest = getSocialPublishingManifest();
  return [
    {
      filePath: path.resolve(process.cwd(), "docs/editorial/social-rotation-calendar.md"),
      content: renderSocialRotationCalendar(manifest),
    },
    {
      filePath: path.resolve(process.cwd(), "docs/automations/social-publishing-runbook.md"),
      content: renderSocialPublishingRunbook(manifest),
    },
  ];
}

function normalized(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function main(): void {
  const check = process.argv.includes("--check");
  const documents = generateSocialPublishingDocuments();
  const stale: string[] = [];

  for (const document of documents) {
    if (check) {
      const current = fs.existsSync(document.filePath) ? normalized(fs.readFileSync(document.filePath, "utf-8")) : "";
      if (current !== normalized(document.content)) stale.push(path.relative(process.cwd(), document.filePath));
      continue;
    }
    fs.mkdirSync(path.dirname(document.filePath), { recursive: true });
    fs.writeFileSync(document.filePath, document.content);
  }

  if (stale.length > 0) {
    throw new Error(`Generated social documentation is stale:\n- ${stale.join("\n- ")}\nRun npm run docs:social.`);
  }
  console.log(check ? "Generated social documentation is current." : "Generated social calendar and publishing runbook.");
}

const isDirectExecution = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
