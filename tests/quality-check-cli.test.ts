import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = require.resolve("tsx/cli");
const qualityCheckScript = path.join(repoRoot, "scripts", "quality-check.ts");

function articleContent(extra = ""): string {
  const paragraph = [
    extra,
    "This research fixture reviews token market structure with $1.23 price context, 12% volatility, and 24,000 tracked references.",
    "The language stays analytical, neutral, and focused on observable data rather than recommendations or hype.",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    Array.from({ length: 38 }, () => paragraph).join("\n\n"),
    "## FAQ",
    "**Q: What does this fixture test?**",
    "A: It tests article quality behavior with enough factual data points for validation.",
    "**Q: Is this financial advice?**",
    "A: No. It is only a research fixture.",
    "---",
    "*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*",
  ].join("\n\n");
}

function writeQueuedArticle(queueDir: string, tokenId: string, type: string, content: string): string {
  const tokenDir = path.join(queueDir, tokenId);
  fs.mkdirSync(tokenDir, { recursive: true });
  const filePath = path.join(tokenDir, `${type}.json`);
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        tokenId,
        type,
        title: `${tokenId} ${type}`,
        slug: type,
        content,
      },
      null,
      2,
    ),
  );
  return filePath;
}

describe("quality-check CLI", () => {
  it("deletes failed queued articles without failing the run", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-quality-"));
    const queueDir = path.join(tmpRoot, "data", "queue");

    try {
      const goodArticle = writeQueuedArticle(queueDir, "good-token", "overview", articleContent());
      const badArticle = writeQueuedArticle(
        queueDir,
        "bad-token",
        "overview",
        articleContent("This paragraph calls the token a moonshot."),
      );

      const result = spawnSync(
        process.execPath,
        [tsxCli, qualityCheckScript, "--dir", queueDir, "--delete-failures"],
        {
          cwd: tmpRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            NODE_ENV: "test",
            TELEGRAM_REPORT_BOT_TOKEN: "",
            TELEGRAM_REPORT_CHAT_ID: "",
          },
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Deleted failed article");
      expect(fs.existsSync(goodArticle)).toBe(true);
      expect(fs.existsSync(badArticle)).toBe(false);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
