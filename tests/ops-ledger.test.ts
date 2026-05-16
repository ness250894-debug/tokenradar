import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const d1Mocks = vi.hoisted(() => ({
  executeD1Query: vi.fn(),
  hasD1Config: vi.fn(),
}));

vi.mock("../src/lib/d1-client", () => d1Mocks);

import {
  hasSocialPost,
  listSocialPostContentKeys,
  recordSocialPost,
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
});
