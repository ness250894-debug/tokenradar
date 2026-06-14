import { afterEach, describe, expect, it, vi } from "vitest";

import { getTokenIconCandidates } from "../src/lib/formatters";
import { fetchTokenIconDataUrl } from "../src/lib/token-icon-data";

describe("token icon candidates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers a supplied source image before deterministic fallbacks", () => {
    expect(getTokenIconCandidates({
      symbol: "sui",
      id: "sui",
      imageUrl: "https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png",
    })).toEqual([
      "https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png",
      "https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images/sui/large.png",
      "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/sui.png",
    ]);
  });

  it("deduplicates mapped symbols and ignores empty sources", () => {
    expect(getTokenIconCandidates({ symbol: "btc", id: "bitcoin", imageUrl: "  " })).toEqual([
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
      "https://cdn.jsdelivr.net/gh/simplr-sh/coin-logos/images/bitcoin/large.png",
      "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png",
    ]);
  });

  it("does not fetch token icons from untrusted source image hosts", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTokenIconDataUrl({
      symbol: "",
      imageUrl: "https://127.0.0.1/internal.png",
    })).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects token icon responses that declare an oversized content length", async () => {
    const response = new Response(new ArrayBuffer(1), {
      headers: {
        "content-type": "image/png",
        "content-length": String(2_000_000),
      },
    });
    const arrayBuffer = vi.spyOn(response, "arrayBuffer");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));

    await expect(fetchTokenIconDataUrl({
      symbol: "",
      imageUrl: "https://coin-images.coingecko.com/coins/images/1/large/icon.png",
    })).resolves.toBeUndefined();

    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("resolves to image/png data URL when the bytes start with PNG magic bytes", async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
    const response = new Response(pngBytes, {
      headers: { "content-type": "image/jpeg" }, // Mismatched content-type header
    });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));

    await expect(fetchTokenIconDataUrl({
      symbol: "",
      imageUrl: "https://coin-images.coingecko.com/coins/images/2/large/icon.png",
    })).resolves.toBe(`data:image/png;base64,${pngBytes.toString("base64")}`);
  });

  it("resolves to image/jpeg data URL when the bytes start with JPEG magic bytes", async () => {
    const jpegBytes = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
    const response = new Response(jpegBytes, {
      headers: { "content-type": "image/png" }, // Mismatched content-type header
    });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));

    await expect(fetchTokenIconDataUrl({
      symbol: "",
      imageUrl: "https://coin-images.coingecko.com/coins/images/3/large/icon.png",
    })).resolves.toBe(`data:image/jpeg;base64,${jpegBytes.toString("base64")}`);
  });

  it("resolves to image/svg+xml data URL when the bytes contain SVG text", async () => {
    const svgBytes = Buffer.from("<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='40'/></svg>");
    const response = new Response(svgBytes, {
      headers: { "content-type": "text/plain" },
    });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));

    await expect(fetchTokenIconDataUrl({
      symbol: "",
      imageUrl: "https://coin-images.coingecko.com/coins/images/4/large/icon.png",
    })).resolves.toBe(`data:image/svg+xml;base64,${svgBytes.toString("base64")}`);
  });

  it("rejects unsupported formats such as WebP", async () => {
    // WebP signature starts with RIFF (52 49 46 46) and WEBP at offset 8 (57 45 42 50)
    const webpBytes = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x24, 0x08, 0x00, 0x00, // Size
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    const response = new Response(webpBytes, {
      headers: { "content-type": "image/webp" },
    });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(response));

    await expect(fetchTokenIconDataUrl({
      symbol: "",
      imageUrl: "https://coin-images.coingecko.com/coins/images/5/large/icon.png",
    })).resolves.toBeUndefined();
  });
});
