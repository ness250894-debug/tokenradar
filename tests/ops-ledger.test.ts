import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const d1Mocks = vi.hoisted(() => ({
  executeD1Query: vi.fn(),
  hasD1Config: vi.fn(),
}));

vi.mock("../src/lib/d1-client", () => d1Mocks);

import {
  hasSocialPost,
  listSocialPostContentKeys,
  recordAutomationRun,
  recordQuotaSnapshot,
  recordSocialPost,
  recordSocialPostMetrics,
} from "../src/lib/ops-ledger";

describe("ops-ledger social posts", () => {
  beforeEach(() => {
    d1Mocks.executeD1Query.mockReset();
    d1Mocks.hasD1Config.mockReset();
    d1Mocks.hasD1Config.mockReturnValue(true);
    delete process.env.D1_OPS_LEDGER_DISABLED;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records social posts with an upsert", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([{ success: true }]);

    await recordSocialPost({
      platform: "x",
      contentKey: "2026-05-16:interactive-poll",
      externalId: "tweet-1",
      postedAt: "2026-05-16T12:00:00.000Z",
      details: { pollType: "sentiment" },
    });

    expect(d1Mocks.executeD1Query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO social_posts"),
      [
        "x",
        "2026-05-16:interactive-poll",
        "tweet-1",
        "2026-05-16T12:00:00.000Z",
        JSON.stringify({ pollType: "sentiment" }),
      ],
    );
  });

  it("checks whether a social post exists", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([
      { success: true, results: [{ found: 1 }] },
    ]);

    await expect(hasSocialPost("telegram", "2026-05-16:telegram-poll")).resolves.toBe(true);
  });

  it("lists social post keys by prefix", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([
      {
        success: true,
        results: [
          { content_key: "2026-05-16:market-update:bitcoin" },
          { content_key: "2026-05-16:market-update:ethereum" },
        ],
      },
    ]);

    await expect(listSocialPostContentKeys("x", "2026-05-16:market-update:")).resolves.toEqual([
      "2026-05-16:market-update:bitcoin",
      "2026-05-16:market-update:ethereum",
    ]);
    expect(d1Mocks.executeD1Query).toHaveBeenCalledWith(
      expect.stringContaining("content_key LIKE ?"),
      ["x", "2026-05-16:market-update:%"],
    );
  });

  it("falls back open when D1 is not configured", async () => {
    d1Mocks.hasD1Config.mockReturnValue(false);

    await expect(hasSocialPost("x", "missing")).resolves.toBe(false);
    await expect(listSocialPostContentKeys("x", "prefix")).resolves.toEqual([]);
    await recordSocialPost({ platform: "x", contentKey: "missing" });

    expect(d1Mocks.executeD1Query).not.toHaveBeenCalled();
  });

  it("records native social post metrics with an upsert", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([{ success: true }]);

    await recordSocialPostMetrics({
      platform: "x",
      contentKey: "2026-06-05:market-update:bitcoin",
      measuredAt: "2026-06-06T00:00:00.000Z",
      impressions: 420,
      likes: 4,
      replies: 1,
      linkClicks: 2,
      details: { source: "manual-export" },
    });

    expect(d1Mocks.executeD1Query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO social_post_metrics"),
      [
        "x",
        "2026-06-05:market-update:bitcoin",
        "2026-06-06T00:00:00.000Z",
        420,
        null,
        4,
        1,
        null,
        null,
        null,
        null,
        2,
        null,
        null,
        null,
        JSON.stringify({ source: "manual-export" }),
      ],
    );
  });

  it("records automation run status with an upsert", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([{ success: true }]);

    await recordAutomationRun({
      id: "123-1",
      workflow: "Social Automations",
      slot: "d1-smoke",
      status: "success",
      startedAt: "2026-05-16T12:00:00.000Z",
      finishedAt: "2026-05-16T12:01:00.000Z",
      details: { sha: "abc" },
    });

    expect(d1Mocks.executeD1Query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO automation_runs"),
      [
        "123-1",
        "Social Automations",
        "d1-smoke",
        "success",
        "2026-05-16T12:00:00.000Z",
        "2026-05-16T12:01:00.000Z",
        JSON.stringify({ sha: "abc" }),
      ],
    );
  });

  it("records quota snapshots with integer counts", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([{ success: true }]);

    await recordQuotaSnapshot({
      source: "d1_storage_bytes",
      period: "2026-05-16",
      count: 86016.9,
      recordedAt: "2026-05-16T12:00:00.000Z",
      details: { databaseName: "tokenradar-d1" },
    });

    expect(d1Mocks.executeD1Query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO quota_snapshots"),
      [
        "d1_storage_bytes",
        "2026-05-16",
        86016,
        "2026-05-16T12:00:00.000Z",
        JSON.stringify({ databaseName: "tokenradar-d1" }),
      ],
    );
  });
});
