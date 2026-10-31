import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", async (importOriginal) => ({
  ...await importOriginal<typeof import("child_process")>(),
  execFileSync: vi.fn(),
}));

vi.mock("../src/lib/video-asset-metadata", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lib/video-asset-metadata")>(),
  resolveFfprobePath: () => "ffprobe",
}));

import { validateRenderedVideoOutput } from "../scripts/post-video-daily";

const tempDirs: string[] = [];

function mockRenderedVideo(durationSeconds: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-render-output-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "render.mp4");
  fs.writeFileSync(filePath, "mock video bytes");
  vi.mocked(execFileSync).mockReturnValue(JSON.stringify({
    streams: [
      { codec_type: "video", width: 1080, height: 1920 },
      { codec_type: "audio" },
    ],
    format: { duration: String(durationSeconds) },
  }));
  return filePath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

describe("rendered video duration validation", () => {
  it.each(["instagram", "youtube"] as const)(
    "accepts the 21.056s %s output reported by the failed scheduled runs",
    (platform) => {
      const filePath = mockRenderedVideo(21.056);

      expect(() => validateRenderedVideoOutput(filePath, platform, {
        voiceoverDurationSeconds: 24,
      })).not.toThrow();
      expect(execFileSync).toHaveBeenCalledWith(
        "ffprobe",
        expect.arrayContaining(["-show_entries", "-of", "json", filePath]),
        { encoding: "utf-8" },
      );
    },
  );

  it.each([19.9, 22.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid or out-of-tolerance duration of %ss at the upper render boundary",
    (durationSeconds) => {
      const filePath = mockRenderedVideo(durationSeconds);

      expect(() => validateRenderedVideoOutput(filePath, "youtube", {
        voiceoverDurationSeconds: 24,
      })).toThrow("rendered video duration is outside tolerance");
    },
  );

  it("preserves duration tolerance at the lower render boundary", () => {
    const filePath = mockRenderedVideo(11.99);

    expect(() => validateRenderedVideoOutput(filePath, "youtube", {
      voiceoverDurationSeconds: 6,
    })).not.toThrow();
  });
});
