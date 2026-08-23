import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const d1Mocks = vi.hoisted(() => ({
  executeD1Query: vi.fn(),
  hasD1Config: vi.fn(),
}));

vi.mock("../src/lib/d1-client", () => d1Mocks);

import {
  getSocialPostLookup,
  hasSocialPost,
  listSocialPostContentKeys,
  listSocialPostEvidence,
  markSocialDeliveryStatus,
  recordAutomationRun,
  recordQuotaSnapshot,
  recordSocialPost,
  recordSocialPostMetrics,
  reconcileSocialDeliveryAsPublished,
  releaseSocialDeliveryForVerifiedRetry,
  reserveSocialDelivery,
  SocialDeliveryBlockedError,
  SocialDeliveryOwnershipLostError,
  SocialDeliveryReconciliationConflictError,
  SocialLedgerUnavailableError,
  SocialLedgerStateError,
  updateSocialPostDetails,
} from "../src/lib/ops-ledger";
import {
  isReconcilableSocialDeliveryState,
  parseSocialDeliveryReconciliationAction,
} from "../scripts/reconcile-social-delivery";

describe("ops-ledger social posts", () => {
  beforeEach(() => {
    d1Mocks.executeD1Query.mockReset();
    d1Mocks.hasD1Config.mockReset();
    d1Mocks.hasD1Config.mockReturnValue(true);
    delete process.env.D1_OPS_LEDGER_DISABLED;
    delete process.env.SOCIAL_DELIVERY_LEDGER_REQUIRED;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.SOCIAL_DELIVERY_LEDGER_REQUIRED;
    delete process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_RUN_ATTEMPT;
    vi.restoreAllMocks();
  });

  it("records social posts with an upsert", async () => {
    d1Mocks.executeD1Query.mockResolvedValue([{ success: true }]);

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
    expect(d1Mocks.executeD1Query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO social_delivery_attempts"),
      expect.arrayContaining([
        "x",
        "2026-05-16:interactive-poll",
        "published:x:2026-05-16:interactive-poll",
        "tweet-1",
      ]),
    );
    expect(d1Mocks.executeD1Query.mock.calls[0][0]).toContain(
      "COALESCE(social_posts.external_id, excluded.external_id)",
    );
  });

  it("checks whether a social post exists", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([
      {
        success: true,
        results: [{
          delivery_status: null,
          delivery_external_id: null,
          delivery_updated_at: null,
          post_found: 1,
          post_external_id: "telegram-1",
          post_posted_at: "2026-05-16T12:00:00.000Z",
        }],
      },
    ]);

    await expect(hasSocialPost("telegram", "2026-05-16:telegram-poll")).resolves.toBe(true);
  });

  it("blocks a duplicate when a prior delivery outcome is unknown", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([
      {
        success: true,
        results: [{
          delivery_status: "outcome_unknown",
          delivery_external_id: null,
          delivery_updated_at: "2026-05-16T12:00:00.000Z",
          post_found: 0,
          post_external_id: null,
          post_posted_at: null,
        }],
      },
    ]);

    await expect(getSocialPostLookup("x", "ambiguous")).resolves.toEqual({
      state: "outcome_unknown",
      blocksPublish: true,
      updatedAt: "2026-05-16T12:00:00.000Z",
    });
  });

  it("does not report an unresolved delivery as successfully posted", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([{
      success: true,
      results: [{
        delivery_status: "outcome_unknown",
        delivery_external_id: null,
        delivery_updated_at: "2026-05-16T12:00:00.000Z",
        post_found: 0,
        post_external_id: null,
        post_posted_at: null,
      }],
    }]);

    await expect(hasSocialPost("x", "ambiguous")).rejects.toBeInstanceOf(
      SocialDeliveryBlockedError,
    );
  });

  it("fails closed when the configured delivery ledger cannot be read", async () => {
    d1Mocks.executeD1Query.mockRejectedValueOnce(new Error("D1 timeout"));

    await expect(hasSocialPost("x", "ambiguous")).rejects.toBeInstanceOf(
      SocialLedgerUnavailableError,
    );
  });

  it("atomically reserves only retryable delivery states", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([
      { success: true, results: [{ status: "publishing" }] },
    ]);

    await expect(reserveSocialDelivery({
      platform: "youtube",
      contentKey: "2026-05-16:video:solana:youtube",
      attemptId: "attempt-1",
    })).resolves.toEqual({ acquired: true, state: "publishing" });

    expect(d1Mocks.executeD1Query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE social_delivery_attempts.status IN ('planned', 'failed')"),
      expect.arrayContaining([
        "youtube",
        "2026-05-16:video:solana:youtube",
        "attempt-1",
      ]),
    );
    expect(d1Mocks.executeD1Query.mock.calls[0][0]).toContain(
      "social_delivery_attempts.attempt_id = excluded.attempt_id",
    );
    expect(d1Mocks.executeD1Query.mock.calls[0][0]).toContain(
      "THEN social_delivery_attempts.attempt_count",
    );
  });

  it("records ambiguous delivery outcomes without making them retryable", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([{ success: true }]);

    await markSocialDeliveryStatus({
      platform: "x",
      contentKey: "2026-05-16:video:solana:x",
      attemptId: "attempt-1",
      status: "outcome_unknown",
      error: "network timeout",
    });

    expect(d1Mocks.executeD1Query).toHaveBeenCalledWith(
      expect.stringContaining("social_delivery_attempts.attempt_id = excluded.attempt_id"),
      expect.arrayContaining([
        "x",
        "2026-05-16:video:solana:x",
        "outcome_unknown",
        "attempt-1",
      ]),
    );
    expect(d1Mocks.executeD1Query.mock.calls[0][0]).toContain(
      "social_delivery_attempts.status NOT IN ('published', 'outcome_unknown')",
    );
  });

  it("uses the same synthesized attempt ID for reserve and status transitions", async () => {
    d1Mocks.executeD1Query
      .mockResolvedValueOnce([{ success: true, results: [{ status: "publishing" }] }])
      .mockResolvedValueOnce([{ success: true, meta: { changes: 1 } }]);

    const record = { platform: "telegram", contentKey: "2026-05-16:telegram-movers" };
    await reserveSocialDelivery(record);
    await markSocialDeliveryStatus({ ...record, status: "failed", error: "safe pre-publish failure" });

    const reserveAttemptId = d1Mocks.executeD1Query.mock.calls[0][1][2];
    const markAttemptId = d1Mocks.executeD1Query.mock.calls[1][1][3];
    expect(markAttemptId).toBe(reserveAttemptId);
  });

  it("separates GitHub rerun attempts while remaining stable within one attempt", async () => {
    process.env.GITHUB_RUN_ID = "run-42";
    d1Mocks.executeD1Query.mockResolvedValue([{ success: true, results: [{ status: "publishing" }] }]);

    process.env.GITHUB_RUN_ATTEMPT = "1";
    await reserveSocialDelivery({ platform: "x", contentKey: "slot-a" });
    process.env.GITHUB_RUN_ATTEMPT = "2";
    await reserveSocialDelivery({ platform: "x", contentKey: "slot-b" });

    const first = d1Mocks.executeD1Query.mock.calls[0][1][2];
    const second = d1Mocks.executeD1Query.mock.calls[1][1][2];
    expect(first).toContain("run-42:attempt-1");
    expect(second).toContain("run-42:attempt-2");
    expect(second).not.toBe(first);
  });

  it("fails when a stale attempt does not own the delivery transition", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([{ success: true, meta: { changes: 0 } }]);

    await expect(markSocialDeliveryStatus({
      platform: "x",
      contentKey: "2026-05-16:slot:x-market:x:market-update",
      attemptId: "stale-attempt",
      status: "failed",
    })).rejects.toBeInstanceOf(SocialDeliveryOwnershipLostError);
  });

  it("requires external evidence before a delivery can be finalized as published", async () => {
    await expect(markSocialDeliveryStatus({
      platform: "x",
      contentKey: "2026-05-16:slot:x-market:x:market-update",
      attemptId: "attempt-1",
      status: "published",
    })).rejects.toThrow("requires an external ID");

    expect(d1Mocks.executeD1Query).not.toHaveBeenCalled();
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
    process.env.SOCIAL_DELIVERY_LEDGER_REQUIRED = "false";

    await expect(hasSocialPost("x", "missing")).resolves.toBe(false);
    await expect(listSocialPostContentKeys("x", "prefix")).resolves.toEqual([]);
    await recordSocialPost({ platform: "x", contentKey: "missing" });

    expect(d1Mocks.executeD1Query).not.toHaveBeenCalled();
  });

  it("fails closed when CI requires the delivery ledger but D1 is not configured", async () => {
    d1Mocks.hasD1Config.mockReturnValue(false);
    process.env.SOCIAL_DELIVERY_LEDGER_REQUIRED = "true";

    await expect(hasSocialPost("x", "missing")).rejects.toBeInstanceOf(SocialLedgerUnavailableError);
    await expect(reserveSocialDelivery({ platform: "x", contentKey: "missing" }))
      .rejects.toBeInstanceOf(SocialLedgerUnavailableError);
    await expect(recordSocialPost({ platform: "x", contentKey: "missing" }))
      .rejects.toBeInstanceOf(SocialLedgerUnavailableError);
    await expect(listSocialPostEvidence("x", "legacy:"))
      .rejects.toBeInstanceOf(SocialLedgerUnavailableError);
    expect(d1Mocks.executeD1Query).not.toHaveBeenCalled();
  });

  it("returns strict legacy post evidence and fails closed on lookup errors", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([{ success: true, results: [{
      platform: "x",
      content_key: "2026-05-16:market-update:bitcoin",
      external_id: "tweet-legacy",
      posted_at: "2026-05-16T03:17:00.000Z",
      details_json: JSON.stringify({ socialSlot: "x-market-update" }),
    }] }]);

    await expect(listSocialPostEvidence("x", "2026-05-16:market-update:"))
      .resolves.toEqual([expect.objectContaining({
        contentKey: "2026-05-16:market-update:bitcoin",
        externalId: "tweet-legacy",
        details: { socialSlot: "x-market-update" },
      })]);

    d1Mocks.executeD1Query.mockRejectedValueOnce(new Error("D1 timeout"));
    await expect(listSocialPostEvidence("x", "2026-05-16:market-update:"))
      .rejects.toBeInstanceOf(SocialLedgerUnavailableError);
  });

  it("treats legacy evidence prefixes as SQL LIKE literals", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([{ success: true, results: [] }]);

    await expect(listSocialPostEvidence("x", "slot_100%\\")).resolves.toEqual([]);

    expect(d1Mocks.executeD1Query).toHaveBeenCalledWith(
      expect.stringContaining("ESCAPE '\\'"),
      ["x", "slot\\_100\\%\\\\%"],
    );
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
        null,
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

  it("patches attribution details without re-recording published evidence", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([{
      success: true,
      results: [{ content_key: "stable-key" }],
    }]);

    await updateSocialPostDetails({
      platform: "x",
      contentKey: "stable-key",
      details: { publishedUrl: "https://tokenradar.co/bitcoin?utm_source=x" },
    });

    expect(d1Mocks.executeD1Query).toHaveBeenCalledOnce();
    expect(d1Mocks.executeD1Query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE social_posts"),
      [
        JSON.stringify({ publishedUrl: "https://tokenradar.co/bitcoin?utm_source=x" }),
        "x",
        "stable-key",
      ],
    );
    expect(d1Mocks.executeD1Query.mock.calls[0][0]).not.toContain("social_delivery_attempts");

    d1Mocks.executeD1Query.mockResolvedValueOnce([{ success: true, results: [] }]);
    await expect(updateSocialPostDetails({
      platform: "x",
      contentKey: "missing-key",
      details: { publishedUrl: "https://tokenradar.co" },
    })).rejects.toBeInstanceOf(SocialLedgerStateError);
  });

  it("surfaces configured metric persistence failures to strict collectors", async () => {
    d1Mocks.executeD1Query.mockRejectedValueOnce(new Error("D1 write timeout"));

    await expect(recordSocialPostMetrics({
      platform: "youtube",
      contentKey: "2026-06-05:video:bitcoin:youtube",
      horizonHours: 24,
      views: 100,
    })).rejects.toBeInstanceOf(SocialLedgerUnavailableError);
  });

  it("releases an unresolved delivery only with explicit no-public-post evidence", async () => {
    d1Mocks.executeD1Query.mockResolvedValueOnce([{ success: true, meta: { changes: 1 } }]);

    await releaseSocialDeliveryForVerifiedRetry({
      platform: "x",
      contentKey: "2026-08-23:slot:x-market-update:x:market-update",
      verificationNote: "Checked the account feed and post search; no matching post exists.",
    });

    expect(d1Mocks.executeD1Query).toHaveBeenCalledWith(
      expect.stringContaining("NOT EXISTS"),
      expect.arrayContaining([
        "x",
        "2026-08-23:slot:x-market-update:x:market-update",
      ]),
    );
    expect(d1Mocks.executeD1Query.mock.calls[0][0]).not.toContain("'publishing'");
    await expect(releaseSocialDeliveryForVerifiedRetry({
      platform: "x",
      contentKey: "key",
      verificationNote: "too short",
    })).rejects.toThrow("verification note");

    d1Mocks.executeD1Query.mockResolvedValueOnce([{ success: true, meta: { changes: 0 } }]);
    await expect(releaseSocialDeliveryForVerifiedRetry({
      platform: "x",
      contentKey: "already-published",
      verificationNote: "Checked the public feed and found existing evidence.",
    })).rejects.toBeInstanceOf(SocialLedgerStateError);
  });

  it("conditionally records operator-confirmed public evidence before finalizing delivery", async () => {
    d1Mocks.executeD1Query
      .mockResolvedValueOnce([{ success: true, meta: { changes: 1 } }])
      .mockResolvedValueOnce([{ success: true, results: [{
        status: "outcome_unknown",
        delivery_external_id: null,
        post_found: 1,
        post_external_id: "public-123",
      }] }])
      .mockResolvedValueOnce([{ success: true, meta: { changes: 1 } }])
      .mockResolvedValueOnce([{ success: true, results: [{
        status: "published",
        delivery_external_id: "public-123",
        post_found: 1,
        post_external_id: "public-123",
      }] }]);

    await reconcileSocialDeliveryAsPublished({
      platform: "x",
      contentKey: "2026-08-23:slot:x-market-update:x:market-update",
      externalId: "public-123",
    });

    const [insertSql, insertParams] = d1Mocks.executeD1Query.mock.calls[0];
    const [updateSql, updateParams] = d1Mocks.executeD1Query.mock.calls[2];
    expect(insertSql).toContain("NOT EXISTS");
    expect(insertSql).toContain("'planned', 'failed', 'outcome_unknown'");
    expect(insertSql).not.toContain("'publishing'");
    expect(insertParams).toEqual(expect.arrayContaining([
      "x",
      "2026-08-23:slot:x-market-update:x:market-update",
      "public-123",
    ]));
    expect(updateSql).toContain("status = 'published'");
    expect(updateSql).toContain("published.external_id = ?");
    expect(updateParams).toEqual(expect.arrayContaining([
      "x",
      "2026-08-23:slot:x-market-update:x:market-update",
      "public-123",
    ]));
  });

  it("rejects reconciliation when newer ledger evidence wins the conditional write", async () => {
    d1Mocks.executeD1Query
      .mockResolvedValueOnce([{ success: true, meta: { changes: 0 } }])
      .mockResolvedValueOnce([{
        success: true,
        results: [{
          status: "publishing",
          delivery_external_id: "different-public-id",
          post_found: 0,
          post_external_id: null,
        }],
      }]);

    await expect(reconcileSocialDeliveryAsPublished({
      platform: "x",
      contentKey: "2026-08-23:slot:x-market-update:x:market-update",
      externalId: "public-123",
    })).rejects.toBeInstanceOf(SocialDeliveryReconciliationConflictError);
  });

  it("heals an interrupted evidence-first reconciliation with the same public ID", async () => {
    d1Mocks.executeD1Query
      .mockResolvedValueOnce([{ success: true, meta: { changes: 0 } }])
      .mockResolvedValueOnce([{ success: true, results: [{
        status: "publishing",
        delivery_external_id: null,
        post_found: 1,
        post_external_id: "public-123",
      }] }])
      .mockResolvedValueOnce([{ success: true, meta: { changes: 1 } }])
      .mockResolvedValueOnce([{ success: true, results: [{
        status: "published",
        delivery_external_id: "public-123",
        post_found: 1,
        post_external_id: "public-123",
      }] }]);

    await expect(reconcileSocialDeliveryAsPublished({
      platform: "x",
      contentKey: "interrupted",
      externalId: "public-123",
    })).resolves.toBeUndefined();

    expect(d1Mocks.executeD1Query.mock.calls[0][0]).not.toContain("'publishing'");
    expect(d1Mocks.executeD1Query.mock.calls[2][0]).toContain(
      "'planned', 'publishing', 'failed', 'outcome_unknown'",
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

describe("social delivery reconciliation CLI", () => {
  it("parses one complete action and rejects mixed or partial release flags", () => {
    expect(parseSocialDeliveryReconciliationAction([
      "--published-external-id",
      "public-123",
    ])).toEqual({ mode: "published", externalId: "public-123" });
    expect(parseSocialDeliveryReconciliationAction([
      "--release",
      "--verified-no-public-post",
      "--note",
      "Checked the public feed and platform dashboard",
    ])).toEqual({
      mode: "release",
      verificationNote: "Checked the public feed and platform dashboard",
    });
    expect(() => parseSocialDeliveryReconciliationAction([
      "--published-external-id",
      "public-123",
      "--release",
    ])).toThrow("not both");
    expect(() => parseSocialDeliveryReconciliationAction([
      "--release",
      "--verified-no-public-post",
    ])).toThrow("requires --release --verified-no-public-post --note");
  });

  it("rejects active publishing attempts and permits failed only for public evidence", () => {
    expect(["planned", "failed", "outcome_unknown"].every((state) =>
      isReconcilableSocialDeliveryState(
        state as "planned" | "failed" | "outcome_unknown",
        "published",
      ),
    )).toBe(true);
    expect(["planned", "outcome_unknown"].every((state) =>
      isReconcilableSocialDeliveryState(
        state as "planned" | "outcome_unknown",
        "release",
      ),
    )).toBe(true);
    expect(isReconcilableSocialDeliveryState("publishing", "published")).toBe(false);
    expect(isReconcilableSocialDeliveryState("publishing", "release")).toBe(false);
    expect(isReconcilableSocialDeliveryState("failed", "release")).toBe(false);
    expect(["not_found", "unavailable", "published"].some((state) =>
      isReconcilableSocialDeliveryState(
        state as "not_found" | "unavailable" | "published",
        "published",
      ),
    )).toBe(false);
  });
});
