import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishInstagramCarousel, publishThreadsText, publishVideo } from "../src/lib/meta-client";

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

describe("publishThreadsText", () => {
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

describe("publishInstagramCarousel", () => {
  beforeEach(() => {
    process.env.IG_ACCESS_TOKEN = "ig-token";
    process.env.IG_ACCOUNT_ID = "ig-user";
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
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
        { imageUrl: "https://media.example/slide-1.png" },
        { imageUrl: "https://media.example/slide-2.png" },
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
    expect(secondChildBody.get("image_url")).toBe("https://media.example/slide-2.png");
    expect(parentBody.get("media_type")).toBe("CAROUSEL");
    expect(parentBody.get("children")).toBe("child-1,child-2");
    expect(publishBody.get("creation_id")).toBe("carousel-1");
  });

  it("rejects carousels outside Instagram's 2-10 item range", async () => {
    await expect(
      publishInstagramCarousel([{ imageUrl: "https://media.example/only.png" }], "Daily movers"),
    ).rejects.toThrow("2-10 items");
  });
});
