import { afterEach, describe, expect, it, vi } from "vitest";

const xdkMocks = vi.hoisted(() => {
  const refreshToken = vi.fn();
  const uploadMedia = vi.fn();
  const initializeUpload = vi.fn();
  const finalizeUpload = vi.fn();
  const getUploadStatus = vi.fn();
  const createMetadata = vi.fn();
  const createPost = vi.fn();

  return {
    refreshToken,
    uploadMedia,
    initializeUpload,
    finalizeUpload,
    getUploadStatus,
    createMetadata,
    createPost,
    reset() {
      refreshToken.mockReset().mockResolvedValue({
        access_token: "access-token",
        expires_in: 7200,
      });
      uploadMedia.mockReset().mockResolvedValue({
        data: { id: "image-123" },
      });
      initializeUpload.mockReset().mockResolvedValue({
        data: { id: "media-123" },
      });
      finalizeUpload.mockReset().mockResolvedValue({
        data: { processingInfo: { state: "succeeded" } },
      });
      getUploadStatus.mockReset();
      createMetadata.mockReset().mockResolvedValue({ data: { id: "image-123" } });
      createPost.mockReset().mockResolvedValue({
        data: { id: "tweet-123" },
      });
    },
  };
});

vi.mock("@xdevplatform/xdk", () => ({
  OAuth2: class {
    refreshToken = xdkMocks.refreshToken;
  },
  Client: class {
    media = {
      upload: xdkMocks.uploadMedia,
      initializeUpload: xdkMocks.initializeUpload,
      finalizeUpload: xdkMocks.finalizeUpload,
      getUploadStatus: xdkMocks.getUploadStatus,
      createMetadata: xdkMocks.createMetadata,
    };

    posts = {
      create: xdkMocks.createPost,
    };
  },
}));

function configureXEnv() {
  process.env.X_OAUTH2_CLIENT_ID = "client-id";
  process.env.X_OAUTH2_CLIENT_SECRET = "client-secret";
  process.env.X_OAUTH2_REFRESH_TOKEN = "refresh-token";
}

describe("postTweetWithMedia video upload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    xdkMocks.reset();
    delete process.env.X_OAUTH2_CLIENT_ID;
    delete process.env.X_OAUTH2_CLIENT_SECRET;
    delete process.env.X_OAUTH2_REFRESH_TOKEN;
  });

  it("uses the X SDK v0.6 camelCase reply contract", async () => {
    configureXEnv();
    xdkMocks.reset();

    const { postTweet } = await import("../src/lib/x-client");
    await postTweet("Research follow-up", "tweet-parent");

    expect(xdkMocks.createPost).toHaveBeenCalledWith({
      text: "Research follow-up",
      reply: { inReplyToTweetId: "tweet-parent" },
    });
  });

  it("uses conservative 1 MB video append chunks for X multipart uploads", async () => {
    configureXEnv();
    xdkMocks.reset();

    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { postTweetWithMedia } = await import("../src/lib/x-client");

    await postTweetWithMedia("Ethereum video", Buffer.alloc(1_000_001, 1), "video/mp4");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, firstAppend] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [, secondAppend] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(firstAppend.method).toBe("POST");
    expect(firstAppend.body).toBeInstanceOf(FormData);
    expect(firstAppend.headers).toEqual({ Authorization: "Bearer access-token" });

    const firstForm = firstAppend.body as FormData;
    const firstMedia = firstForm.get("media");
    expect(firstForm.get("segment_index")).toBe("0");
    expect(firstMedia).toBeInstanceOf(Blob);
    expect((firstMedia as Blob).size).toBe(1_000_000);

    const secondForm = secondAppend.body as FormData;
    const secondMedia = secondForm.get("media");
    expect(secondForm.get("segment_index")).toBe("1");
    expect(secondMedia).toBeInstanceOf(Blob);
    expect((secondMedia as Blob).size).toBe(1);
    expect(xdkMocks.createPost).toHaveBeenCalledWith({
      text: "Ethereum video",
      media: { mediaIds: ["media-123"] },
    });
  });

  it("does not publish a text-only tweet when video upload fails", async () => {
    configureXEnv();
    xdkMocks.reset();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => new Response("", { status: 413 }));
    vi.stubGlobal("fetch", fetchMock);

    const { postTweetWithMedia } = await import("../src/lib/x-client");

    await expect(
      postTweetWithMedia("Ethereum video", Buffer.alloc(1024, 1), "video/mp4"),
    ).rejects.toThrow("APPEND seg0 failed: HTTP 413");

    expect(xdkMocks.createPost).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not publishing a text-only video tweet"),
    );
  });

  it("prefers X string media IDs when INIT returns both numeric and string IDs", async () => {
    configureXEnv();
    xdkMocks.reset();
    xdkMocks.initializeUpload.mockResolvedValueOnce({
      data: {
        id: 123,
        media_id_string: "1880028106020515840",
      },
    });

    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { postTweetWithMedia } = await import("../src/lib/x-client");

    await postTweetWithMedia("Ethereum video", Buffer.alloc(1024, 1), "video/mp4");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/1880028106020515840/append");
    expect(xdkMocks.finalizeUpload).toHaveBeenCalledWith("1880028106020515840");
    expect(xdkMocks.createPost).toHaveBeenCalledWith({
      text: "Ethereum video",
      media: { mediaIds: ["1880028106020515840"] },
    });
  });

  it("does not retry final media tweet creation after an ambiguous X API failure", async () => {
    configureXEnv();
    xdkMocks.reset();
    xdkMocks.createPost
      .mockRejectedValueOnce(Object.assign(new Error("temporary outage"), { status: 503 }));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { postTweetWithMedia } = await import("../src/lib/x-client");

    await expect(
      postTweetWithMedia("Ethereum chart", Buffer.alloc(1024, 1), "image/png"),
    ).rejects.toMatchObject({ name: "XCreateOutcomeUnknownError", status: 503 });

    expect(xdkMocks.createPost).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not retrying automatically"),
    );
  });

  it.each([502, 504])("treats final media tweet HTTP %s as an ambiguous create", async (status) => {
    configureXEnv();
    xdkMocks.reset();
    xdkMocks.createPost.mockRejectedValueOnce(Object.assign(new Error("gateway failure"), { status }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { postTweetWithMedia } = await import("../src/lib/x-client");

    await expect(
      postTweetWithMedia("Ethereum chart", Buffer.alloc(1024, 1), "image/png"),
    ).rejects.toMatchObject({ name: "XCreateOutcomeUnknownError", status });
    expect(xdkMocks.createPost).toHaveBeenCalledTimes(1);
  });

  it("attaches normalized alt text before publishing an image", async () => {
    configureXEnv();
    xdkMocks.reset();

    const { postTweetWithMedia } = await import("../src/lib/x-client");

    await postTweetWithMedia(
      "Ethereum comparison",
      Buffer.alloc(1024, 1),
      "image/png",
      undefined,
      "  Ethereum   and Solana risk comparison  ",
    );

    expect(xdkMocks.createMetadata).toHaveBeenCalledWith({
      id: "image-123",
      metadata: { altText: { text: "Ethereum and Solana risk comparison" } },
    });
    expect(xdkMocks.createMetadata.mock.invocationCallOrder[0]).toBeLessThan(
      xdkMocks.createPost.mock.invocationCallOrder[0],
    );
  });

  it("falls back to text-only when required image alt text cannot be attached", async () => {
    configureXEnv();
    xdkMocks.reset();
    xdkMocks.createMetadata.mockRejectedValue(new Error("metadata unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { postTweetWithMedia } = await import("../src/lib/x-client");
    await postTweetWithMedia(
      "Ethereum comparison",
      Buffer.alloc(1024, 1),
      "image/png",
      undefined,
      "Ethereum comparison chart",
    );

    expect(xdkMocks.createPost).toHaveBeenCalledWith({ text: "Ethereum comparison" });
  });

  it("keeps text unchanged when image upload falls back to text-only", async () => {
    configureXEnv();
    xdkMocks.reset();
    xdkMocks.uploadMedia.mockRejectedValueOnce(Object.assign(new Error("bad image"), { status: 400 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { postTweetWithMedia } = await import("../src/lib/x-client");
    await postTweetWithMedia("Ethereum comparison", Buffer.alloc(1024, 1), "image/png");

    expect(xdkMocks.createPost).toHaveBeenCalledWith({ text: "Ethereum comparison" });
  });

  it("does not post a fallback poll after an ambiguous native-poll outcome", async () => {
    configureXEnv();
    xdkMocks.reset();
    xdkMocks.createPost.mockRejectedValueOnce(new Error("socket closed"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { postPoll } = await import("../src/lib/x-client");

    await expect(postPoll({
      text: "Which setup?",
      options: ["Alpha", "Beta"],
    })).rejects.toMatchObject({ name: "XCreateOutcomeUnknownError" });
    expect(xdkMocks.createPost).toHaveBeenCalledTimes(1);
  });

  it("does not publish a video tweet when processing never completes", async () => {
    configureXEnv();
    xdkMocks.reset();
    xdkMocks.finalizeUpload.mockResolvedValueOnce({
      data: { processingInfo: { state: "pending", checkAfterSecs: 0 } },
    });
    xdkMocks.getUploadStatus.mockResolvedValue({
      data: { processingInfo: { state: "in_progress", checkAfterSecs: 0 } },
    });

    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { postTweetWithMedia } = await import("../src/lib/x-client");

    await expect(
      postTweetWithMedia("Ethereum video", Buffer.alloc(1024, 1), "video/mp4"),
    ).rejects.toThrow("Video processing did not complete");

    expect(xdkMocks.createPost).not.toHaveBeenCalled();
  });

  it("normalizes poll options before creating a native poll", async () => {
    configureXEnv();
    xdkMocks.reset();

    const { postPoll } = await import("../src/lib/x-client");

    await postPoll({
      text: "Which setup looks strongest?",
      options: [
        "  Alpha momentum with a very long label  ",
        "",
        "$ETH rotation",
        "Gamma retest",
        "Delta squeeze",
        "Unused fifth option",
      ],
    });

    expect(xdkMocks.createPost).toHaveBeenCalledWith({
      text: "Which setup looks strongest?",
      poll: {
        options: [
          "Alpha momentum with...",
          "$ETH rotation",
          "Gamma retest",
          "Delta squeeze",
        ],
        durationMinutes: 1440,
      },
    });
  });

  it("rejects polls with fewer than two non-empty options", async () => {
    configureXEnv();
    xdkMocks.reset();

    const { postPoll } = await import("../src/lib/x-client");

    await expect(
      postPoll({
        text: "Pick one",
        options: ["", "   "],
      }),
    ).rejects.toThrow("at least 2");

    expect(xdkMocks.createPost).not.toHaveBeenCalled();
  });
});
