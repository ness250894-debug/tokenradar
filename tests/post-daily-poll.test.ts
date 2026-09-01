import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  callAIWithFallback: vi.fn(),
  cleanupExpiredCooldownFolders: vi.fn(),
  existsSync: vi.fn(),
  hasSocialPost: vi.fn(),
  markSocialDeliveryStatus: vi.fn(),
  mkdirSync: vi.fn(),
  recordSocialPost: vi.fn(),
  reserveSocialDelivery: vi.fn(),
  sendTelegramPoll: vi.fn(),
  writeFileAtomicSync: vi.fn(),
}));

vi.mock("fs", async (importOriginal) => ({
  ...await importOriginal<typeof import("fs")>(),
  existsSync: dependencies.existsSync,
  mkdirSync: dependencies.mkdirSync,
}));

vi.mock("../src/lib/gemini", () => ({
  callAIWithFallback: dependencies.callAIWithFallback,
}));

vi.mock("../src/lib/telegram", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lib/telegram")>(),
  sendTelegramPoll: dependencies.sendTelegramPoll,
}));

vi.mock("../src/lib/ops-ledger", () => ({
  hasSocialPost: dependencies.hasSocialPost,
  markSocialDeliveryStatus: dependencies.markSocialDeliveryStatus,
  recordSocialPost: dependencies.recordSocialPost,
  reserveSocialDelivery: dependencies.reserveSocialDelivery,
}));

vi.mock("../src/lib/utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lib/utils")>(),
  loadEnv: vi.fn(),
  writeFileAtomicSync: dependencies.writeFileAtomicSync,
}));

vi.mock("../scripts/lib/social-history", () => ({
  getRecentSocialArchetypeKeys: vi.fn(() => []),
  getRecentSocialVariantKeys: vi.fn(() => []),
}));

vi.mock("../scripts/lib/token-selection", () => ({
  cleanupExpiredCooldownFolders: dependencies.cleanupExpiredCooldownFolders,
}));

import { main } from "../scripts/post-daily-poll";

describe("Telegram poll delivery idempotency", () => {
  let originalTelegramChannelId: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-09-02T17:13:00.000Z"));
    originalTelegramChannelId = process.env.TELEGRAM_CHANNEL_ID;
    process.env.TELEGRAM_CHANNEL_ID = "@tokenradar-test";

    dependencies.existsSync.mockReturnValue(false);
    dependencies.hasSocialPost.mockResolvedValue(false);
    dependencies.reserveSocialDelivery.mockResolvedValue({
      acquired: true,
      state: "publishing",
    });
    dependencies.callAIWithFallback.mockResolvedValue({
      content: JSON.stringify({
        question: "Community Pulse: Which signal deserves the next research pass?",
        options: ["Liquidity", "Momentum", "Risk", "Catalysts"],
      }),
    });
    dependencies.sendTelegramPoll.mockResolvedValue(42);
    dependencies.recordSocialPost.mockResolvedValue(undefined);
    dependencies.markSocialDeliveryStatus.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTelegramChannelId === undefined) {
      delete process.env.TELEGRAM_CHANNEL_ID;
    } else {
      process.env.TELEGRAM_CHANNEL_ID = originalTelegramChannelId;
    }
  });

  it("reserves before sending and records a successful poll", async () => {
    await main([]);

    expect(dependencies.reserveSocialDelivery).toHaveBeenCalledWith(expect.objectContaining({
      platform: "telegram",
      contentKey: "2099-09-02:telegram-poll",
    }));
    expect(dependencies.reserveSocialDelivery.mock.invocationCallOrder[0])
      .toBeLessThan(dependencies.sendTelegramPoll.mock.invocationCallOrder[0]);
    expect(dependencies.recordSocialPost).toHaveBeenCalledWith(expect.objectContaining({
      platform: "telegram",
      contentKey: "2099-09-02:telegram-poll",
      externalId: 42,
    }));
    expect(dependencies.markSocialDeliveryStatus).not.toHaveBeenCalled();
  });

  it("blocks a retry and records outcome_unknown when Telegram may have accepted the poll", async () => {
    const ambiguousError = Object.assign(
      new Error("Call to sendPoll failed! (502: Bad Gateway)"),
      { error_code: 502 },
    );
    dependencies.sendTelegramPoll.mockRejectedValue(ambiguousError);

    await expect(main([])).rejects.toBe(ambiguousError);

    expect(dependencies.markSocialDeliveryStatus).toHaveBeenCalledWith(expect.objectContaining({
      platform: "telegram",
      contentKey: "2099-09-02:telegram-poll",
      status: "outcome_unknown",
      externalId: undefined,
    }));
    expect(dependencies.recordSocialPost).not.toHaveBeenCalled();
  });

  it("records failed when Telegram deterministically rejects the poll before returning a message ID", async () => {
    const definitiveError = Object.assign(
      new Error("Call to sendPoll failed! (400: Bad Request: poll options are invalid)"),
      { error_code: 400 },
    );
    dependencies.sendTelegramPoll.mockRejectedValue(definitiveError);

    await expect(main([])).rejects.toBe(definitiveError);

    expect(dependencies.markSocialDeliveryStatus).toHaveBeenCalledWith(expect.objectContaining({
      platform: "telegram",
      contentKey: "2099-09-02:telegram-poll",
      status: "failed",
      externalId: undefined,
    }));
    expect(dependencies.recordSocialPost).not.toHaveBeenCalled();
  });

  it("preserves published evidence when ledger finalization fails after the send", async () => {
    const recordError = new Error("D1 finalization failed");
    dependencies.recordSocialPost.mockRejectedValue(recordError);

    await expect(main([])).rejects.toBe(recordError);

    expect(dependencies.markSocialDeliveryStatus).toHaveBeenCalledWith(expect.objectContaining({
      platform: "telegram",
      contentKey: "2099-09-02:telegram-poll",
      status: "published",
      externalId: 42,
    }));
  });

  it("does not send when a prior ambiguous delivery blocks the reservation", async () => {
    dependencies.reserveSocialDelivery.mockResolvedValue({
      acquired: false,
      state: "outcome_unknown",
    });

    await expect(main([])).rejects.toThrow(
      "Telegram poll delivery is outcome_unknown; reconcile it before retrying.",
    );

    expect(dependencies.sendTelegramPoll).not.toHaveBeenCalled();
    expect(dependencies.markSocialDeliveryStatus).not.toHaveBeenCalled();
  });
});
