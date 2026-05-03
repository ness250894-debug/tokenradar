import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../src/lib/fetch-with-retry";

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries transient HTTP failures and returns the successful response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 500, statusText: "Server Error" }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const retryAttempts: number[] = [];
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry("https://example.com/api", {
      retries: 2,
      retryDelay: 0,
      onRetry: (_error, attempt) => retryAttempts.push(attempt),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retryAttempts).toEqual([1]);
  });

  it("does not retry definitive client errors", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not found", { status: 404, statusText: "Not Found" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchWithRetry("https://example.com/missing", { retries: 3, retryDelay: 0 }),
    ).rejects.toThrow("HTTP Error: 404 Not Found");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
