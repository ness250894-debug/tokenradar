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
});
