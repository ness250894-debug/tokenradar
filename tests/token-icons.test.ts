import { describe, expect, it } from "vitest";

import { getTokenIconCandidates } from "../src/lib/formatters";

describe("token icon candidates", () => {
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
});
