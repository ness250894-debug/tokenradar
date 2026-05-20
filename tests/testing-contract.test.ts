import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { describe, expect, it } from "vitest";

import { buildMarkdownDocumentArtifact } from "../src/lib/doc-artifacts";

const TESTING_DOC = path.join(process.cwd(), "docs", "testing", "testing.json");
const TESTING_HTML = path.join(process.cwd(), "docs", "testing", "testing.html");

function gitCheckIgnore(filePath: string) {
  return spawnSync("git", ["-c", "safe.directory=D:/tokenradar", "check-ignore", "--no-index", filePath], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
}

describe("testing flow contract implementation", () => {
  it("keeps the testing artifact source of record successfully ignored by git and retires TESTING.md", () => {
    expect(gitCheckIgnore("docs/testing/testing.json").status).toBe(0);
    expect(gitCheckIgnore("docs/testing/testing.html").status).toBe(0);
    expect(fs.existsSync(path.join(process.cwd(), "TESTING.md"))).toBe(false);
  });

  it("exposes a package script for regenerating the testing artifacts", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["docs:testing"]).toBe("tsx scripts/generate-doc-artifacts.ts --doc testing");
  });

  it("keeps the documented test inventory and generated artifact metadata current", () => {
    const artifact = JSON.parse(fs.readFileSync(TESTING_DOC, "utf-8")) as {
      rawMarkdown: string;
      stats: unknown;
      headings: unknown;
      sections: unknown;
    };
    const generated = buildMarkdownDocumentArtifact({
      name: "Testing contract fixture",
      title: "Testing contract fixture",
      rawMarkdown: artifact.rawMarkdown,
      sourcePath: null,
      htmlArtifact: "docs/testing/testing.html",
      jsonArtifact: "docs/testing/testing.json",
      updatedAt: "2026-05-18",
      version: 2,
    });
    const testFileCount = fs.readdirSync(path.join(process.cwd(), "tests")).filter((file) => file.endsWith(".test.ts"))
      .length;

    expect(artifact.stats).toEqual(generated.stats);
    expect(artifact.headings).toEqual(generated.headings);
    expect(artifact.sections).toEqual(generated.sections);
    expect(artifact.rawMarkdown).toContain(`The repository currently has ${testFileCount} Vitest files`);
    expect(fs.readFileSync(TESTING_HTML, "utf-8")).toContain("TokenRadar Testing Flow Contract");
  });

  it("blocks unmocked fetch calls in Vitest by default", async () => {
    await expect(fetch("data:text/plain,unmocked")).rejects.toThrow("Unexpected unmocked fetch call in Vitest");
  });
});
