import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTikTokAuthUrl,
  buildTikTokChunkPlan,
  getTikTokCredentialMode,
  hasTikTokApiCredentials,
  normalizeTikTokCaption,
  publishVideoDirectlyToTikTok,
  uploadVideoToTikTokInbox,
} from "../src/lib/tiktok-client";
import { SOCIAL_PLATFORM_LIMITS } from "../src/lib/config";

describe("TikTok client helpers", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("builds a TikTok OAuth URL with upload scope", () => {
    process.env.TIKTOK_CLIENT_KEY = "sandbox-client-key";
    process.env.TIKTOK_REDIRECT_URI = "https://tokenradar.co/api/tiktok/callback";

    const url = new URL(buildTikTokAuthUrl({ state: "test-state" }));

    expect(url.origin).toBe("https://www.tiktok.com");
    expect(url.pathname).toBe("/v2/auth/authorize/");
    expect(url.searchParams.get("client_key")).toBe("sandbox-client-key");
    expect(url.searchParams.get("scope")).toContain("video.upload");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://tokenradar.co/api/tiktok/callback");
    expect(url.searchParams.get("state")).toBe("test-state");
  });

  it("builds a production TikTok OAuth URL with publish scope", () => {
    process.env.TIKTOK_ENV = "production";
    process.env.TIKTOK_CLIENT_KEY = "production-client-key";
    process.env.TIKTOK_REDIRECT_URI = "https://tokenradar.co/api/tiktok/callback";

    const url = new URL(buildTikTokAuthUrl({ state: "test-state" }));

    expect(url.searchParams.get("scope")).toContain("video.publish");
    expect(url.searchParams.get("scope")).not.toContain("video.upload");
  });

  it("defaults TikTok credentials to sandbox mode", () => {
    delete process.env.TIKTOK_ENV;

    expect(getTikTokCredentialMode()).toBe("sandbox");
  });

  it("detects production TikTok credential mode", () => {
    process.env.TIKTOK_ENV = "prod";

    expect(getTikTokCredentialMode()).toBe("production");
  });

  it("detects TikTok API credentials when a refresh token is configured", () => {
    process.env.TIKTOK_CLIENT_KEY = "key";
    process.env.TIKTOK_CLIENT_SECRET = "secret";
    process.env.TIKTOK_REFRESH_TOKEN = "refresh";
    delete process.env.TIKTOK_ACCESS_TOKEN;

    expect(hasTikTokApiCredentials()).toBe(true);
  });

  it("requires a token for TikTok API credentials", () => {
    process.env.TIKTOK_CLIENT_KEY = "key";
    process.env.TIKTOK_CLIENT_SECRET = "secret";
    delete process.env.TIKTOK_REFRESH_TOKEN;
    delete process.env.TIKTOK_ACCESS_TOKEN;

    expect(hasTikTokApiCredentials()).toBe(false);
  });

  it("builds a whole-upload chunk plan for videos up to 64 MB", () => {
    const plan = buildTikTokChunkPlan(27 * 1024 * 1024);

    expect(plan.videoSize).toBe(27 * 1024 * 1024);
    expect(plan.chunkSize).toBe(27 * 1024 * 1024);
    expect(plan.totalChunkCount).toBe(1);
  });

  it("builds a multi-chunk plan for videos over 64 MB", () => {
    const plan = buildTikTokChunkPlan(77 * 1024 * 1024);

    expect(plan.videoSize).toBe(77 * 1024 * 1024);
    expect(plan.chunkSize).toBe(10 * 1024 * 1024);
    expect(plan.totalChunkCount).toBe(7);
  });

  it("normalizes TikTok captions to the platform limit", () => {
    const longCaption = "x".repeat(SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT + 10);

    expect(normalizeTikTokCaption(longCaption)).toHaveLength(SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT);
    expect(normalizeTikTokCaption("   ")).toContain("#TokenRadar");
  });

  it("initializes, uploads, and checks status for a TikTok inbox upload", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-client-"));
    const videoPath = path.join(tmpDir, "video.mp4");
    fs.writeFileSync(videoPath, Buffer.from("video!"));

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: {
          publish_id: "publish-1",
          upload_url: "https://upload.example/chunk",
        },
        error: { code: "ok" },
      }), { status: 200 }),
    ).mockResolvedValueOnce(
      new Response("", { status: 200 }),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: { status: "PROCESSING_UPLOAD" },
        error: { code: "ok" },
      }), { status: 200 }),
    );

    try {
      const result = await uploadVideoToTikTokInbox({
        videoPath,
        accessToken: "access-token",
      });

      expect(result).toEqual({
        publishId: "publish-1",
        status: { status: "PROCESSING_UPLOAD" },
      });

      expect(fetchMock.mock.calls[0][0]).toBe("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/");
      expect(fetchMock.mock.calls[1][0]).toBe("https://upload.example/chunk");
      const uploadRequest = fetchMock.mock.calls[1][1] as RequestInit;
      expect(uploadRequest.method).toBe("PUT");
      expect(uploadRequest.headers).toMatchObject({
        "Content-Range": "bytes 0-5/6",
        "Content-Length": "6",
      });
      expect(fetchMock.mock.calls[2][0]).toBe("https://open.tiktokapis.com/v2/post/publish/status/fetch/");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("uploads TikTok chunks using an oversized final chunk", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-client-chunks-"));
    const videoPath = path.join(tmpDir, "video.mp4");
    const videoSize = 77 * 1024 * 1024;
    fs.closeSync(fs.openSync(videoPath, "w"));
    fs.truncateSync(videoPath, videoSize);

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: {
          publish_id: "publish-chunks-1",
          upload_url: "https://upload.example/chunked",
        },
        error: { code: "ok" },
      }), { status: 200 }),
    );
    for (let index = 0; index < 7; index++) {
      fetchMock.mockResolvedValueOnce(new Response("", { status: index === 6 ? 201 : 206 }));
    }
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: { status: "PROCESSING_UPLOAD" },
        error: { code: "ok" },
      }), { status: 200 }),
    );

    try {
      const result = await uploadVideoToTikTokInbox({
        videoPath,
        accessToken: "access-token",
      });

      expect(result.publishId).toBe("publish-chunks-1");

      const initRequest = fetchMock.mock.calls[0][1] as RequestInit;
      const initBody = JSON.parse(initRequest.body as string);
      expect(initBody.source_info).toMatchObject({
        video_size: videoSize,
        chunk_size: 10 * 1024 * 1024,
        total_chunk_count: 7,
      });

      const firstUpload = fetchMock.mock.calls[1][1] as RequestInit;
      const finalUpload = fetchMock.mock.calls[7][1] as RequestInit;
      expect(firstUpload.headers).toMatchObject({
        "Content-Range": `bytes 0-${10 * 1024 * 1024 - 1}/${videoSize}`,
        "Content-Length": String(10 * 1024 * 1024),
      });
      expect(finalUpload.headers).toMatchObject({
        "Content-Range": `bytes ${60 * 1024 * 1024}-${videoSize - 1}/${videoSize}`,
        "Content-Length": String(videoSize - 60 * 1024 * 1024),
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("queries creator info, initializes, uploads, and checks status for a direct TikTok post", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-direct-"));
    const videoPath = path.join(tmpDir, "video.mp4");
    fs.writeFileSync(videoPath, Buffer.from("video!"));

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: {
          creator_username: "tokenradarco",
          privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
        },
        error: { code: "ok" },
      }), { status: 200 }),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: {
          publish_id: "publish-direct-1",
          upload_url: "https://upload.example/direct-chunk",
        },
        error: { code: "ok" },
      }), { status: 200 }),
    ).mockResolvedValueOnce(
      new Response("", { status: 200 }),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: { status: "PROCESSING_UPLOAD" },
        error: { code: "ok" },
      }), { status: 200 }),
    );

    try {
      const result = await publishVideoDirectlyToTikTok({
        videoPath,
        caption: "TokenRadar test caption #Crypto",
        accessToken: "access-token",
      });

      expect(result.publishId).toBe("publish-direct-1");
      expect(result.privacyLevel).toBe("PUBLIC_TO_EVERYONE");
      expect(result.creatorInfo?.creator_username).toBe("tokenradarco");

      expect(fetchMock.mock.calls[0][0]).toBe("https://open.tiktokapis.com/v2/post/publish/creator_info/query/");
      expect(fetchMock.mock.calls[1][0]).toBe("https://open.tiktokapis.com/v2/post/publish/video/init/");
      const initRequest = fetchMock.mock.calls[1][1] as RequestInit;
      const initBody = JSON.parse(initRequest.body as string);
      expect(initBody.post_info).toMatchObject({
        title: "TokenRadar test caption #Crypto",
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        brand_content_toggle: false,
        brand_organic_toggle: false,
        is_aigc: false,
      });
      expect(initBody.source_info).toMatchObject({
        source: "FILE_UPLOAD",
        video_size: 6,
        chunk_size: 6,
        total_chunk_count: 1,
      });
      expect(fetchMock.mock.calls[2][0]).toBe("https://upload.example/direct-chunk");
      expect(fetchMock.mock.calls[3][0]).toBe("https://open.tiktokapis.com/v2/post/publish/status/fetch/");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
