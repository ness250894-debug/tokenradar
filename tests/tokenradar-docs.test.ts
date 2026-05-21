import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { describe, expect, it } from "vitest";

const TOKENRADAR_DOC_JSON = path.join(process.cwd(), "docs", "tokenradar", "tokenradar.json");
const TOKENRADAR_DOC_HTML = path.join(process.cwd(), "docs", "tokenradar", "tokenradar.html");
const README_DOC_JSON = path.join(process.cwd(), "docs", "readme", "readme.json");

const DOC_ARTIFACT_PATHS = [
  "docs/automations/automations.html",
  "docs/automations/automations.json",
  "docs/data-schema/data-schema.html",
  "docs/data-schema/data-schema.json",
  "docs/deployment/deployment.html",
  "docs/deployment/deployment.json",
  "docs/design/design.html",
  "docs/design/design.json",
  "docs/editorial/editorial.html",
  "docs/editorial/editorial.json",
  "docs/integrations/integrations.html",
  "docs/integrations/integrations.json",
  "docs/pipeline/pipeline.html",
  "docs/pipeline/pipeline.json",
  "docs/prompts/prompts.html",
  "docs/prompts/prompts.json",
  "docs/public-video-assets-broll-readme/public-video-assets-broll-readme.html",
  "docs/public-video-assets-broll-readme/public-video-assets-broll-readme.json",
  "docs/readme/readme.html",
  "docs/readme/readme.json",
  "docs/seo/seo.html",
  "docs/seo/seo.json",
  "docs/testing/testing.html",
  "docs/testing/testing.json",
  "docs/tokenradar/tokenradar.html",
  "docs/tokenradar/tokenradar.json",
] as const;

const PUBLIC_HTML_JSON_ARTIFACTS = [
  "public/_routes.json",
  "public/video-assets/broll/manifest.json",
  "public/video-assets/broll/manifest.example.json",
] as const;

function gitCheckIgnore(filePath: string) {
  return spawnSync("git", ["-c", "safe.directory=D:/tokenradar", "check-ignore", "--no-index", filePath], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
}

function normalizeLineEndings(text: string | undefined): string | undefined {
  return text?.replace(/\r\n/g, "\n");
}

describe("tokenradar project docs", () => {
  it("keeps the docs folder ignored by git", () => {
    expect(gitCheckIgnore("docs/tokenradar/tokenradar.html").status).toBe(0);
    expect(gitCheckIgnore("docs/tokenradar/tokenradar.json").status).toBe(0);
  });

  it("lists maintained docs and public HTML/JSON artifacts in docs/tokenradar", () => {
    if (!fs.existsSync(TOKENRADAR_DOC_JSON)) return;
    const artifact = JSON.parse(fs.readFileSync(TOKENRADAR_DOC_JSON, "utf-8")) as {
      rawMarkdown?: string;
      htmlArtifact?: string;
      jsonArtifact?: string;
    };
    const html = fs.readFileSync(TOKENRADAR_DOC_HTML, "utf-8");

    expect(artifact.htmlArtifact).toBe("docs/tokenradar/tokenradar.html");
    expect(artifact.jsonArtifact).toBe("docs/tokenradar/tokenradar.json");

    for (const artifactPath of [...DOC_ARTIFACT_PATHS, ...PUBLIC_HTML_JSON_ARTIFACTS]) {
      expect(fs.existsSync(path.join(process.cwd(), artifactPath))).toBe(true);
      expect(artifact.rawMarkdown).toContain(artifactPath);
      expect(html).toContain(artifactPath);
    }
  });

  it("keeps docs/readme generated from the root README", () => {
    if (!fs.existsSync(README_DOC_JSON)) return;
    const rootReadme = fs.readFileSync(path.join(process.cwd(), "README.md"), "utf-8");
    const artifact = JSON.parse(fs.readFileSync(README_DOC_JSON, "utf-8")) as {
      rawMarkdown?: string;
      sourcePath?: string | null;
    };

    expect(artifact.sourcePath).toBe("README.md");
    expect(normalizeLineEndings(artifact.rawMarkdown)).toBe(normalizeLineEndings(rootReadme));
  });

  it("does not depend on the retired root TOKENRADAR.md source file", () => {
    if (!fs.existsSync(TOKENRADAR_DOC_JSON)) return;
    const artifact = JSON.parse(fs.readFileSync(TOKENRADAR_DOC_JSON, "utf-8")) as {
      rawMarkdown?: string;
      sourcePath?: string | null;
    };
    const html = fs.readFileSync(TOKENRADAR_DOC_HTML, "utf-8");

    expect(fs.existsSync(path.join(process.cwd(), "TOKENRADAR.md"))).toBe(false);
    expect(artifact.sourcePath).toBe("docs/tokenradar/tokenradar.json#rawMarkdown");
    expect(artifact.rawMarkdown).not.toContain("TOKENRADAR.md");
    expect(html).not.toContain("TOKENRADAR.md");
  });
});
