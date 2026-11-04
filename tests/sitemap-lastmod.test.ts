import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";
import { afterEach, describe, expect, it } from "vitest";
import { generateXml, getSourceDate, latestContentDate } from "../scripts/generate-sitemap";

const temporaryDirectories: string[] = [];

function makeDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-lastmod-"));
  temporaryDirectories.push(directory);
  return directory;
}

function git(directory: string, args: string[], date?: string): string {
  return execFileSync("git", ["-c", "user.name=SEO test", "-c", "user.email=seo@example.test", ...args], {
    cwd: directory,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
    env: {
      ...process.env,
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
    },
  }).trim();
}

function makeRepository(): string {
  const directory = makeDirectory();
  git(directory, ["init"]);
  fs.writeFileSync(path.join(directory, "page.tsx"), "original page");
  git(directory, ["add", "page.tsx"]);
  git(directory, ["commit", "-m", "Create page"], "2026-08-22T12:00:00Z");
  fs.writeFileSync(path.join(directory, "other.txt"), "unrelated update");
  git(directory, ["add", "other.txt"]);
  git(directory, ["commit", "-m", "Update unrelated content"], "2026-11-04T12:00:00Z");
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("tokenradar-lastmod-")) {
      throw new Error(`Unsafe test cleanup path: ${resolved}`);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

describe("sitemap modification dates", () => {
  it("keeps the last real source change when checkout mtimes are newer", () => {
    const directory = makeRepository();
    fs.utimesSync(path.join(directory, "page.tsx"), new Date(), new Date());
    expect(getSourceDate("page.tsx", directory)).toBe("2026-08-22");
  });

  it("does not mistake a shallow checkout boundary for a source modification", () => {
    const origin = makeRepository();
    const clone = makeDirectory();
    git(clone, ["clone", "--depth=1", pathToFileURL(origin).href, "."]);
    expect(git(clone, ["rev-parse", "--is-shallow-repository"])).toBe("true");
    expect(getSourceDate("page.tsx", clone)).toBeUndefined();
  });

  it("omits an unknown source date instead of using checkout mtime or an arbitrary fallback", () => {
    const directory = makeDirectory();
    fs.writeFileSync(path.join(directory, "page.tsx"), "exported source without git history");
    expect(getSourceDate("page.tsx", directory)).toBeUndefined();
    expect(getSourceDate("missing.tsx", directory)).toBeUndefined();
  });

  it("dates a mixed editorial and market page from the newest valid evidence", () => {
    expect(latestContentDate("2026-05-13", "2026-11-03T22:31:58Z")).toBe("2026-11-03");
    expect(latestContentDate("2026-11-04", "2026-11-03T22:31:58Z")).toBe("2026-11-04");
    expect(latestContentDate("missing", undefined)).toBeUndefined();
  });

  it("omits optional or invalid lastmod values without losing sitemap URLs", () => {
    const xml = generateXml([
      { url: "/unknown" },
      { url: "/invalid", lastmod: "not-a-date" },
      { url: "/known", lastmod: "2026-08-22" },
    ]);
    expect(xml).toContain("<loc>https://tokenradar.co/unknown</loc>");
    expect(xml).toContain("<loc>https://tokenradar.co/invalid</loc>");
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
    expect(xml).toContain("<lastmod>2026-08-22</lastmod>");
  });
});
