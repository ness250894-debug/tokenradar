import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const awsMocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send = awsMocks.send;
  }

  class MockCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockCommand,
    DeleteObjectCommand: MockCommand,
    ListObjectsV2Command: MockCommand,
  };
});

import { cleanPrefix, deleteObjects, uploadBuffer } from "../src/lib/r2-client";

function commandInput(callIndex: number): Record<string, unknown> {
  return (awsMocks.send.mock.calls[callIndex][0] as { input: Record<string, unknown> }).input;
}

describe("r2-client prefix staging", () => {
  beforeEach(() => {
    process.env.R2_ACCOUNT_ID = "account";
    process.env.R2_ACCESS_KEY_ID = "access";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_BUCKET_NAME = "tokenradar-media-staging";
    process.env.R2_PUBLIC_URL = "https://media.tokenradar.co";
    awsMocks.send.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_PUBLIC_URL;
    vi.restoreAllMocks();
  });

  it("uploads buffers under nested keys and returns an encoded public URL", async () => {
    awsMocks.send.mockResolvedValueOnce({});

    const url = await uploadBuffer(
      Buffer.from("png-data"),
      "ig-carousel/2026-05-11/slide 01.png",
      "image/png",
    );

    expect(commandInput(0)).toMatchObject({
      Bucket: "tokenradar-media-staging",
      Key: "ig-carousel/2026-05-11/slide 01.png",
      ContentType: "image/png",
    });
    expect(url).toBe("https://media.tokenradar.co/ig-carousel/2026-05-11/slide%2001.png");
  });

  it("cleans only objects returned under the requested prefix", async () => {
    awsMocks.send
      .mockResolvedValueOnce({
        Contents: [
          { Key: "video/2026-05-11/instagram.mp4" },
          { Key: "video/2026-05-11/threads.mp4" },
        ],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const deleted = await cleanPrefix("video/2026-05-11/");

    expect(deleted).toBe(2);
    expect(commandInput(0)).toMatchObject({
      Bucket: "tokenradar-media-staging",
      Prefix: "video/2026-05-11/",
    });
    expect(commandInput(1)).toMatchObject({
      Bucket: "tokenradar-media-staging",
      Key: "video/2026-05-11/instagram.mp4",
    });
    expect(commandInput(2)).toMatchObject({
      Bucket: "tokenradar-media-staging",
      Key: "video/2026-05-11/threads.mp4",
    });
  });

  it("deduplicates explicit object deletes", async () => {
    awsMocks.send.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    const deleted = await deleteObjects([
      "ig-carousel/2026-05-11/slide-01.png",
      "ig-carousel/2026-05-11/slide-01.png",
      "ig-carousel/2026-05-11/slide-02.png",
    ]);

    expect(deleted).toBe(2);
    expect(awsMocks.send).toHaveBeenCalledTimes(2);
  });
});
