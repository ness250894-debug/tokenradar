import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishVideo } from "../src/lib/meta-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("publishVideo for Threads", () => {
  beforeEach(() => {
    process.env.THREADS_ACCESS_TOKEN = "threads-token";
    process.env.THREADS_ACCOUNT_ID = "me";
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.THREADS_ACCESS_TOKEN;
    delete process.env.THREADS_ACCOUNT_ID;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends Threads spoiler entities with Meta's expected field name", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-1", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await publishVideo("threads", "https://cdn.example/video.mp4", "Alpha is moving", {
      topicTag: "Crypto",
      spoilerEntities: [{ entity_type: "SPOILER", offset: 0, length: 5 }],
    });

    const createOptions = fetchMock.mock.calls[0][1] as RequestInit;
    const createBody = new URLSearchParams(createOptions.body as string);

    expect(createBody.get("topic_tag")).toBe("Crypto");
    expect(createBody.get("text_entities")).toBe(
      JSON.stringify([{ entity_type: "SPOILER", offset: 0, length: 5 }]),
    );
  });

  it("retries Threads container creation without optional decorations after code 100", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        error: {
          message: "Invalid parameter",
          type: "OAuthException",
          code: 100,
          fbtrace_id: "trace-1",
        },
      }, 400))
      .mockResolvedValueOnce(jsonResponse({ id: "container-2" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-2", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-2" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishVideo("threads", "https://cdn.example/video.mp4", "Alpha is moving", {
      topicTag: "Crypto",
      spoilerEntities: [{ entity_type: "SPOILER", offset: 0, length: 5 }],
    });

    const firstCreateBody = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const retryCreateBody = new URLSearchParams((fetchMock.mock.calls[1][1] as RequestInit).body as string);

    expect(result).toEqual({ id: "post-2", platform: "threads" });
    expect(firstCreateBody.get("topic_tag")).toBe("Crypto");
    expect(firstCreateBody.get("text_entities")).toBeTruthy();
    expect(retryCreateBody.has("topic_tag")).toBe(false);
    expect(retryCreateBody.has("text_entities")).toBe(false);
  });
});
