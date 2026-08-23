import { describe, expect, it } from "vitest";

import { getPeggedAssetReason, isPeggedAsset } from "../src/lib/asset-classification";

describe("pegged asset classification", () => {
  it("catches a newly listed stablecoin from its identity and price profile", () => {
    const usdgo = {
      id: "usdgo",
      symbol: "USDGO",
      name: "USDGO",
      categories: ["Solana Ecosystem", "Payment Solutions"],
      price: 1,
      change24h: 0,
      change7d: 0,
    };

    expect(getPeggedAssetReason(usdgo)).toBe("fiat-identity-and-price-profile");
    expect(isPeggedAsset(usdgo)).toBe(true);
  });

  it("uses stablecoin descriptions even when categories are incomplete", () => {
    expect(isPeggedAsset({
      id: "new-dollar",
      symbol: "NWD",
      name: "New Dollar",
      description: "A regulated stablecoin pegged to the U.S. dollar and fully backed by Treasuries.",
      price: 1,
    })).toBe(true);
  });

  it("does not classify a volatile token merely because USD appears in its prose", () => {
    expect(isPeggedAsset({
      id: "growth-protocol",
      symbol: "GROW",
      name: "Growth Protocol",
      description: "Trading volume is reported in USD.",
      price: 4.2,
      change24h: 8,
      change7d: -12,
    })).toBe(false);
  });
});
