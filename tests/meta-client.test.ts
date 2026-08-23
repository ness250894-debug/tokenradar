import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMetaPublishOutcomeUnknownError,
  publishImage,
  publishInstagramCarousel,
  publishThreadsText,
  publishVideo,
} from "../src/lib/meta-client";

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
    vi.useRealTimers();
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

  it("does not retry an ambiguous Threads publish response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-3" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-3", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({
        error: {
          message: "An unexpected error has occurred. Please retry your request later.",
          type: "OAuthException",
          code: 2,
          fbtrace_id: "trace-2",
        },
      }, 500))
      .mockResolvedValueOnce(jsonResponse({ id: "post-3" }));
    vi.stubGlobal("fetch", fetchMock);

    const error = await publishVideo("threads", "https://cdn.example/video.mp4", "Alpha is moving")
      .catch((caught) => caught as unknown);

    expect(isMetaPublishOutcomeUnknownError(error)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("treats a successful final-publish response without an ID as outcome unknown", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-missing-id" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-missing-id", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const error = await publishVideo("threads", "https://cdn.example/video.mp4", "Alpha is moving")
      .catch((caught) => caught as unknown);

    expect(isMetaPublishOutcomeUnknownError(error)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps an explicitly unpublished container retryable after final retry exhaustion", async () => {
    vi.useFakeTimers();
    const notReady = () => jsonResponse({
      error: {
        message: "Media ID is not available for publishing",
        type: "OAuthException",
        code: 9007,
        error_subcode: 2207027,
      },
    }, 400);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-still-not-ready" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-still-not-ready", status: "FINISHED" }))
      .mockResolvedValueOnce(notReady())
      .mockResolvedValueOnce(notReady())
      .mockResolvedValueOnce(notReady());
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = publishVideo("threads", "https://cdn.example/video.mp4", "Alpha is moving");
    const errorPromise = resultPromise.catch((caught) => caught as unknown);
    await vi.runAllTimersAsync();
    const error = await errorPromise;

    expect(isMetaPublishOutcomeUnknownError(error)).toBe(false);
    expect(error).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("treats an explicit final-publish rate limit as a definitive rejection", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-rate-limited" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-rate-limited", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({
        error: {
          message: "Application request limit reached",
          type: "OAuthException",
          code: 4,
        },
      }, 429));
    vi.stubGlobal("fetch", fetchMock);

    const error = await publishVideo("threads", "https://cdn.example/video.mp4", "Alpha is moving")
      .catch((caught) => caught as unknown);

    expect(isMetaPublishOutcomeUnknownError(error)).toBe(false);
    expect(error).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("publishThreadsText", () => {
  beforeEach(() => {
    process.env.THREADS_ACCESS_TOKEN = "threads-token";
    process.env.THREADS_ACCOUNT_ID = "me";
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.THREADS_ACCESS_TOKEN;
    delete process.env.THREADS_ACCOUNT_ID;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a text container, polls it, and publishes to Threads", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "text-container-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "text-container-1", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "threads-post-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishThreadsText("What invalidates Alpha first?", {
      topicTag: "Crypto",
      spoilerEntities: [{ entity_type: "SPOILER", offset: 17, length: 5 }],
    });

    const createBody = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const publishBody = new URLSearchParams((fetchMock.mock.calls[2][1] as RequestInit).body as string);

    expect(result).toEqual({ id: "threads-post-1", platform: "threads" });
    expect(createBody.get("media_type")).toBe("TEXT");
    expect(createBody.get("text")).toBe("What invalidates Alpha first?");
    expect(createBody.get("topic_tag")).toBe("Crypto");
    expect(createBody.get("text_entities")).toBe(
      JSON.stringify([{ entity_type: "SPOILER", offset: 17, length: 5 }]),
    );
    expect(publishBody.get("creation_id")).toBe("text-container-1");
  });
});

describe("publishImage", () => {
  beforeEach(() => {
    process.env.IG_ACCESS_TOKEN = "ig-token";
    process.env.IG_ACCOUNT_ID = "ig-user";
    process.env.THREADS_ACCESS_TOKEN = "threads-token";
    process.env.THREADS_ACCOUNT_ID = "threads-user";
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.IG_ACCESS_TOKEN;
    delete process.env.IG_ACCOUNT_ID;
    delete process.env.THREADS_ACCESS_TOKEN;
    delete process.env.THREADS_ACCOUNT_ID;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("publishes a static Instagram feed image", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "ig-image-container" }))
      .mockResolvedValueOnce(jsonResponse({ id: "ig-image-container", status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "ig-image-post" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishImage(
      "instagram",
      "https://media.example/comparison.jpg",
      "ALP vs BET",
      { altText: "Alpha versus Beta comparison" },
    );

    const createBody = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(result).toEqual({ id: "ig-image-post", platform: "instagram" });
    expect(createBody.get("image_url")).toBe("https://media.example/comparison.jpg");
    expect(createBody.get("caption")).toBe("ALP vs BET");
    expect(createBody.get("alt_text")).toBe("Alpha versus Beta comparison");
    expect(createBody.has("media_type")).toBe(false);
  });

  it("publishes a Threads image with its text and topic tag", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "threads-image-container" }))
      .mockResolvedValueOnce(jsonResponse({ id: "threads-image-container", status: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "threads-image-post" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishImage(
      "threads",
      "https://media.example/comparison.jpg",
      "ALP vs BET",
      { topicTag: "CryptoResearch", altText: "Alpha versus Beta comparison" },
    );

    const createBody = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(result).toEqual({ id: "threads-image-post", platform: "threads" });
    expect(createBody.get("media_type")).toBe("IMAGE");
    expect(createBody.get("image_url")).toBe("https://media.example/comparison.jpg");
    expect(createBody.get("text")).toBe("ALP vs BET");
    expect(createBody.get("topic_tag")).toBe("CryptoResearch");
    expect(createBody.get("alt_text")).toBe("Alpha versus Beta comparison");
  });
});

describe("publishInstagramCarousel", () => {
  beforeEach(() => {
    process.env.IG_ACCESS_TOKEN = "ig-token";
    process.env.IG_ACCOUNT_ID = "ig-user";
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.IG_ACCESS_TOKEN;
    delete process.env.IG_ACCOUNT_ID;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates child containers, bundles them, and publishes the parent carousel", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "child-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "child-1", status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "child-2" }))
      .mockResolvedValueOnce(jsonResponse({ id: "child-2", status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "carousel-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "carousel-1", status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-ig-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishInstagramCarousel(
      [
        { imageUrl: "https://media.example/slide-1.png", altText: "Market movers cover" },
        { imageUrl: "https://media.example/slide-2.png", altText: "Ranked movers board" },
      ],
      "Daily movers https://tokenradar.co",
    );

    const firstChildBody = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const secondChildBody = new URLSearchParams((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    const parentBody = new URLSearchParams((fetchMock.mock.calls[4][1] as RequestInit).body as string);
    const publishBody = new URLSearchParams((fetchMock.mock.calls[6][1] as RequestInit).body as string);

    expect(result).toEqual({ id: "post-ig-1", platform: "instagram" });
    expect(firstChildBody.get("image_url")).toBe("https://media.example/slide-1.png");
    expect(firstChildBody.get("is_carousel_item")).toBe("true");
    expect(firstChildBody.get("alt_text")).toBe("Market movers cover");
    expect(secondChildBody.get("image_url")).toBe("https://media.example/slide-2.png");
    expect(secondChildBody.get("alt_text")).toBe("Ranked movers board");
    expect(parentBody.get("media_type")).toBe("CAROUSEL");
    expect(parentBody.get("children")).toBe("child-1,child-2");
    expect(publishBody.get("creation_id")).toBe("carousel-1");
  });

  it("retries the final carousel publish with backoff when Meta says it is not ready", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "child-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "child-1", status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "child-2" }))
      .mockResolvedValueOnce(jsonResponse({ id: "child-2", status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "carousel-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "carousel-1", status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({
        error: {
          message: "Media ID is not available for publishing",
          type: "OAuthException",
          code: 9007,
          error_subcode: 2207027,
        },
      }, 400))
      .mockResolvedValueOnce(jsonResponse({ id: "post-ig-retry" }));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = publishInstagramCarousel(
      [
        { imageUrl: "https://media.example/slide-1.png" },
        { imageUrl: "https://media.example/slide-2.png" },
      ],
      "Daily movers",
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({ id: "post-ig-retry", platform: "instagram" });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("code 9007"));
    const firstPublishBody = (fetchMock.mock.calls[6][1] as RequestInit).body;
    const retryPublishBody = (fetchMock.mock.calls[7][1] as RequestInit).body;
    expect(retryPublishBody).toBe(firstPublishBody);
  });

  it("rejects carousels outside Instagram's 2-10 item range", async () => {
    await expect(
      publishInstagramCarousel([{ imageUrl: "https://media.example/only.png" }], "Daily movers"),
    ).rejects.toThrow("2-10 items");
  });
});

describe("publishVideo for Instagram", () => {
  beforeEach(() => {
    process.env.IG_ACCESS_TOKEN = "ig-token";
    process.env.IG_ACCOUNT_ID = "ig-user";
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.IG_ACCESS_TOKEN;
    delete process.env.IG_ACCOUNT_ID;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("includes detailed status message on Instagram container error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-ig" }))
      .mockResolvedValueOnce(jsonResponse({
        id: "container-ig",
        status_code: "ERROR",
        status: "Video aspect ratio is invalid."
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      publishVideo("instagram", "https://cdn.example/video.mp4", "Check this out")
    ).rejects.toThrow("Container container-ig failed with status: ERROR. Video aspect ratio is invalid.");

    const pollRequest = fetchMock.mock.calls[1][0] as string;
    expect(pollRequest).toContain("fields=status_code%2Cstatus");
  });

  it("retries on media fetching error subcode 2207052", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        error: {
          message: "Only photo or video can be accepted as media type.",
          type: "OAuthException",
          code: 9004,
          error_subcode: 2207052,
        }
      }, 400))
      .mockResolvedValueOnce(jsonResponse({ id: "container-ig" }))
      .mockResolvedValueOnce(jsonResponse({ id: "container-ig", status_code: "FINISHED" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-ig" }));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = publishVideo("instagram", "https://cdn.example/video.mp4", "Check this out");
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({ id: "post-ig", platform: "instagram" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("code 9004"));
  });
});
