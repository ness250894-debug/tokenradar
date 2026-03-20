import { describe, it, expect } from "vitest";
import { safeReadJson } from "../src/lib/utils";
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
