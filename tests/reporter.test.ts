import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TELEGRAM_ENV = {
  TELEGRAM_REPORT_BOT_TOKEN: "test-token",
  TELEGRAM_REPORT_CHAT_ID: "12345",
};

describe("sendTelegramAlert", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("TELEGRAM_REPORT_BOT_TOKEN", TELEGRAM_ENV.TELEGRAM_REPORT_BOT_TOKEN);
    vi.stubEnv("TELEGRAM_REPORT_CHAT_ID", TELEGRAM_ENV.TELEGRAM_REPORT_CHAT_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries as plain text when Telegram rejects Markdown parsing", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, description: "Bad Request: can't parse entities" }), {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { sendTelegramAlert } = await import("../src/lib/reporter");
    await expect(sendTelegramAlert("*bad_markdown")).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const secondOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const firstBody = JSON.parse(String(firstOptions.body));
    const secondBody = JSON.parse(String(secondOptions.body));

    expect(firstBody.parse_mode).toBe("Markdown");
    expect(secondBody.parse_mode).toBeUndefined();
    expect(secondBody.link_preview_options).toEqual({ is_disabled: true });
  });
});
