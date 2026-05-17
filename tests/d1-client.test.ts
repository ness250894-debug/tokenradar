import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeD1Query, hasD1Config, loadD1Config } from "../src/lib/d1-client";

describe("d1-client", () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "account";
    process.env.CLOUDFLARE_API_TOKEN = "token";
    process.env.D1_DATABASE_ID = "database";
  });

  afterEach(() => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.D1_DATABASE_ID;
    delete process.env.CLOUDFLARE_API_BASE_URL;
    vi.unstubAllGlobals();
  });

  it("loads required D1 configuration from environment variables", () => {
    expect(hasD1Config()).toBe(true);
    expect(loadD1Config()).toMatchObject({
      accountId: "account",
      apiToken: "token",
      databaseId: "database",
      apiBaseUrl: "https://api.cloudflare.com/client/v4",
    });
  });

  it("returns an empty result when optional configuration is missing", async () => {
    delete process.env.D1_DATABASE_ID;

    const result = await executeD1Query("SELECT 1");

    expect(result).toEqual([]);
  });

  it("posts SQL and params to the Cloudflare D1 query endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          errors: [],
          messages: [],
          result: [{ success: true, results: [{ id: "row-1" }], meta: { rows_read: 1 } }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeD1Query<{ id: string }>("SELECT id FROM media_staging WHERE object_key = ?", [
      "video/example.mp4",
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account/d1/database/database/query",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sql: "SELECT id FROM media_staging WHERE object_key = ?",
          params: ["video/example.mp4"],
        }),
      }),
    );
    expect(result[0].results).toEqual([{ id: "row-1" }]);
  });

  it("retries transient Cloudflare D1 failures before returning results", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("temporary failure", { status: 500, statusText: "Server Error" }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            errors: [],
            messages: [],
            result: [{ success: true, results: [{ ok: true }] }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeD1Query<{ ok: boolean }>("SELECT 1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result[0].results).toEqual([{ ok: true }]);
  });

  it("throws on Cloudflare API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: false,
            errors: [{ code: 7000, message: "bad token" }],
            messages: [],
          }),
          { status: 403, statusText: "Forbidden" },
        ),
      ),
    );

    await expect(executeD1Query("SELECT 1")).rejects.toThrow("7000: bad token");
  });
});
