import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertSocialReviewRecordPublishable,
  persistNeedsReviewRecord,
  transitionSocialReviewRecord,
} from "../src/lib/social-review-queue";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("social review queue", () => {
  it("durably records sanitized needs-review metadata and blocks publication", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-social-review-"));
    temporaryDirectories.push(rootDir);

    const persisted = persistNeedsReviewRecord({
      tokenName: "Pump.fun",
      symbol: "PUMP",
      platforms: ["x", "telegram", "x"],
      generationAttempt: 1,
      facts: {
        tokenName: "Pump.fun",
        symbol: "PUMP",
        priceChange24h: 17,
        marketDataSource: "coingecko-live",
        marketDataAsOf: "2026-08-23T09:30:00.000Z",
        suppliedContext: ["Unsafe source context must not be copied to review storage."],
      },
      issues: [{
        field: "xTweet",
        issues: [{
          code: "unsafe-language",
          message: "Rejected raw text must not be stored.",
          value: "investment instruction",
        }],
      }],
    }, {
      rootDir,
      now: new Date("2026-08-23T10:00:00.000Z"),
    });

    expect(fs.existsSync(persisted.path)).toBe(true);
    const serialized = fs.readFileSync(persisted.path, "utf8");
    expect(serialized).not.toContain("Rejected raw text");
    expect(serialized).not.toContain("Unsafe source context");
    expect(persisted.record).toMatchObject({
      state: "needs_review",
      platforms: ["telegram", "x"],
      stateHistory: [
        { state: "generated", actor: "validator" },
        { state: "needs_review", actor: "validator" },
      ],
      issues: [{ field: "xTweet", codes: ["unsafe-language"] }],
    });
    expect(() => assertSocialReviewRecordPublishable(persisted.record))
      .toThrow("publication is blocked");
  });

  it("requires an explicit reviewer transition before needs-review copy is publishable", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-social-review-"));
    temporaryDirectories.push(rootDir);
    const persisted = persistNeedsReviewRecord({
      tokenName: "Alpha",
      symbol: "ALP",
      platforms: ["threads"],
      generationAttempt: 2,
      facts: { tokenName: "Alpha", symbol: "ALP" },
      issues: [{
        field: "threadsCaption",
        issues: [{ code: "unsupported-source-claim", message: "Unsupported." }],
      }],
    }, { rootDir });

    const approved = transitionSocialReviewRecord(
      persisted.path,
      "approved",
      "editor@example.com",
      new Date("2026-08-23T11:00:00.000Z"),
    );

    expect(() => assertSocialReviewRecordPublishable(approved)).not.toThrow();
    expect(approved).toMatchObject({ state: "approved", reviewer: "editor@example.com" });
    expect(() => transitionSocialReviewRecord(persisted.path, "validated", "editor@example.com"))
      .toThrow("Invalid social review transition");
  });

  it("rejects malformed review records and blank reviewer identities without rewriting them", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-social-review-"));
    temporaryDirectories.push(rootDir);
    const persisted = persistNeedsReviewRecord({
      tokenName: "Alpha",
      symbol: "ALP",
      platforms: ["x"],
      generationAttempt: 1,
      facts: { tokenName: "Alpha", symbol: "ALP" },
      issues: [],
    }, { rootDir });
    const validRecord = JSON.parse(fs.readFileSync(persisted.path, "utf8"));

    fs.writeFileSync(
      persisted.path,
      `${JSON.stringify({ ...validRecord, schemaVersion: 2 }, null, 2)}\n`,
      "utf8",
    );
    const unsupportedVersion = fs.readFileSync(persisted.path, "utf8");
    expect(() => transitionSocialReviewRecord(persisted.path, "approved", "editor@example.com"))
      .toThrow("Unsupported social review schema version: 2");
    expect(fs.readFileSync(persisted.path, "utf8")).toBe(unsupportedVersion);

    fs.writeFileSync(
      persisted.path,
      `${JSON.stringify({ ...validRecord, state: "archived" }, null, 2)}\n`,
      "utf8",
    );
    const invalidState = fs.readFileSync(persisted.path, "utf8");
    expect(() => transitionSocialReviewRecord(persisted.path, "approved", "editor@example.com"))
      .toThrow("Invalid social review state: archived");
    expect(fs.readFileSync(persisted.path, "utf8")).toBe(invalidState);

    fs.writeFileSync(persisted.path, `${JSON.stringify(validRecord, null, 2)}\n`, "utf8");
    const beforeBlankReviewer = fs.readFileSync(persisted.path, "utf8");
    expect(() => transitionSocialReviewRecord(persisted.path, "approved", "   "))
      .toThrow("non-empty reviewer identity");
    expect(fs.readFileSync(persisted.path, "utf8")).toBe(beforeBlankReviewer);
  });
});
