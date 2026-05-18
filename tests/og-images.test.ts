import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { shouldRegenerateOutput } from "../scripts/generate-og-images";

describe("OG image generation freshness", () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    for (const root of tmpRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function makeTempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-og-test-"));
    tmpRoots.push(root);
    return root;
  }

  it("regenerates existing images when source data is newer", () => {
    const root = makeTempRoot();
    const output = path.join(root, "out.png");
    const source = path.join(root, "token.json");

    fs.writeFileSync(output, "old-image");
    fs.writeFileSync(source, "{}");
    const now = new Date("2026-05-18T12:00:00.000Z");
    fs.utimesSync(output, new Date("2026-05-18T10:00:00.000Z"), new Date("2026-05-18T10:00:00.000Z"));
    fs.utimesSync(source, now, now);

    expect(shouldRegenerateOutput(output, [source], false)).toBe(true);
  });

  it("keeps existing images when they are newer than source data", () => {
    const root = makeTempRoot();
    const output = path.join(root, "out.png");
    const source = path.join(root, "token.json");

    fs.writeFileSync(output, "fresh-image");
    fs.writeFileSync(source, "{}");
    fs.utimesSync(source, new Date("2026-05-18T10:00:00.000Z"), new Date("2026-05-18T10:00:00.000Z"));
    fs.utimesSync(output, new Date("2026-05-18T12:00:00.000Z"), new Date("2026-05-18T12:00:00.000Z"));

    expect(shouldRegenerateOutput(output, [source], false)).toBe(false);
  });
});
