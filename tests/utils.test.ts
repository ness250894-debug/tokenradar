import { afterEach, describe, it, expect, vi } from "vitest";
import { redactSensitiveText, safeReadJson, writeFileAtomicSync } from "../src/lib/utils";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("safeReadJson", () => {
  const tmpDir = os.tmpdir();

  it("returns fallback when file does not exist", () => {
    const result = safeReadJson("/nonexistent/path.json", { default: true });
    expect(result).toEqual({ default: true });
  });

  it("parses valid JSON correctly", () => {
    const tmpFile = path.join(tmpDir, `test-valid-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ key: "value", count: 42 }));
    try {
      const result = safeReadJson<{ key: string; count: number }>(tmpFile, { key: "", count: 0 });
      expect(result.key).toBe("value");
      expect(result.count).toBe(42);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("returns fallback for corrupted JSON", () => {
    const tmpFile = path.join(tmpDir, `test-corrupt-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, "{ not valid json !!!");
    try {
      const result = safeReadJson(tmpFile, []);
      expect(result).toEqual([]);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("returns fallback for empty file", () => {
    const tmpFile = path.join(tmpDir, `test-empty-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, "");
    try {
      const result = safeReadJson(tmpFile, null);
      expect(result).toBeNull();
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("returns fallback for whitespace-only file", () => {
    const tmpFile = path.join(tmpDir, `test-ws-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, "   \n\n  ");
    try {
      const result = safeReadJson(tmpFile, "default");
      expect(result).toBe("default");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe("writeFileAtomicSync", () => {
  it("writes complete JSON and removes the temporary write file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-atomic-"));
    const targetFile = path.join(tmpDir, "tracker.json");

    try {
      writeFileAtomicSync(targetFile, JSON.stringify({ postedAt: "2026-06-03T00:00:00.000Z" }, null, 2));

      expect(JSON.parse(fs.readFileSync(targetFile, "utf-8"))).toEqual({
        postedAt: "2026-06-03T00:00:00.000Z",
      });
      expect(fs.readdirSync(tmpDir).filter((file) => file.endsWith(".tmp"))).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("redactSensitiveText", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redacts documented secret env values beyond the hand-maintained core list", () => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "google-oauth-secret-value");
    vi.stubEnv("GOOGLE_OAUTH_REFRESH_TOKEN", "google-oauth-refresh-value");
    vi.stubEnv("PAGESPEED_API_KEY", "pagespeed-secret-value");
    vi.stubEnv("PEXELS_API_KEY", "pexels-secret-value");
    vi.stubEnv("INDEXNOW_KEY", "indexnow-secret-value");

    const redacted = redactSensitiveText(
      [
        "google-oauth-secret-value",
        "google-oauth-refresh-value",
        "pagespeed-secret-value",
        "pexels-secret-value",
        "indexnow-secret-value",
      ].join(" "),
    );

    expect(redacted).not.toContain("google-oauth-secret-value");
    expect(redacted).not.toContain("google-oauth-refresh-value");
    expect(redacted).not.toContain("pagespeed-secret-value");
    expect(redacted).not.toContain("pexels-secret-value");
    expect(redacted).not.toContain("indexnow-secret-value");
    expect(redacted).toContain("[REDACTED:GOOGLE_OAUTH_CLIENT_SECRET]");
    expect(redacted).toContain("[REDACTED:GOOGLE_OAUTH_REFRESH_TOKEN]");
    expect(redacted).toContain("[REDACTED:PAGESPEED_API_KEY]");
    expect(redacted).toContain("[REDACTED:PEXELS_API_KEY]");
    expect(redacted).toContain("[REDACTED:INDEXNOW_KEY]");
  });
});
