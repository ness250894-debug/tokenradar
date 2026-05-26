import { afterEach, describe, expect, it, vi } from "vitest";

const xdkMocks = vi.hoisted(() => {
  const refreshToken = vi.fn();
  const initializeUpload = vi.fn();
  const finalizeUpload = vi.fn();
  const getUploadStatus = vi.fn();
  const createPost = vi.fn();

  return {
    refreshToken,
    initializeUpload,
    finalizeUpload,
    getUploadStatus,
    createPost,
    reset() {
      refreshToken.mockReset().mockResolvedValue({
        access_token: "access-token",
        expires_in: 7200,
      });
      initializeUpload.mockReset().mockResolvedValue({
        data: { id: "media-123" },
      });
      finalizeUpload.mockReset().mockResolvedValue({
        data: { processingInfo: { state: "succeeded" } },
      });
      getUploadStatus.mockReset();
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
      initializeUpload: xdkMocks.initializeUpload,
      finalizeUpload: xdkMocks.finalizeUpload,
      getUploadStatus: xdkMocks.getUploadStatus,
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

  it("sends video append chunks as multipart raw media", async () => {
    configureXEnv();
    xdkMocks.reset();

    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { postTweetWithMedia } = await import("../src/lib/x-client");

    await postTweetWithMedia("Ethereum video", Buffer.alloc(5 * 1024 * 1024, 1), "video/mp4");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toEqual({ Authorization: "Bearer access-token" });

    const form = init.body as FormData;
    expect(form.get("segment_index")).toBe("0");
    expect(form.get("media")).toBeInstanceOf(Blob);
    expect(xdkMocks.createPost).toHaveBeenCalledWith({
      text: "Ethereum video",
      media: { media_ids: ["media-123"] },
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
});
