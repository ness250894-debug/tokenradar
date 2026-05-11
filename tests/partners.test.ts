import { describe, expect, it } from "vitest";

import {
  PARTNER_REL,
  PARTNERS,
  getExchangePartners,
  getExchangeReferralRecords,
  getPartner,
  getPartnerLinkAttributes,
  getPartnersByCategory,
  isRestrictedForUsAudience,
} from "../src/lib/partners";

describe("partner registry", () => {
  it("keeps partner ids unique and affiliate links explicit", () => {
    const ids = new Set(PARTNERS.map((partner) => partner.id));

    expect(ids.size).toBe(PARTNERS.length);
    for (const partner of PARTNERS) {
      expect(partner.url).toMatch(/^https:\/\//);
      expect(partner.disclosure).toMatch(/Paid link/);
      expect(partner.availability.note.length).toBeGreaterThan(20);
    }
  });

  it("separates US-eligible exchange links from global-only links", () => {
    const primaryExchangeIds = getExchangePartners().map((partner) => partner.id);
    const allExchangeIds = getExchangePartners({ includeUsRestricted: true }).map((partner) => partner.id);

    expect(primaryExchangeIds).toEqual(["okx"]);
    expect(allExchangeIds).toEqual(["okx", "binance", "bybit", "kucoin"]);
    expect(isRestrictedForUsAudience(getPartner("okx")!)).toBe(false);
    expect(isRestrictedForUsAudience(getPartner("binance")!)).toBe(true);
    expect(isRestrictedForUsAudience(getPartner("bybit")!)).toBe(true);
    expect(isRestrictedForUsAudience(getPartner("kucoin")!)).toBe(true);
  });

  it("exports social referral records from the exchange category only", () => {
    const exchangePartnerUrls = getPartnersByCategory("exchange").map((partner) => partner.url);

    expect(getExchangeReferralRecords()).toEqual(
      getPartnersByCategory("exchange").map((partner) => ({
        name: partner.name,
        url: partner.url,
      })),
    );
    expect(exchangePartnerUrls).not.toContain(getPartner("ledger")!.url);
  });

  it("adds sponsored rel and analytics metadata to partner links", () => {
    const partner = getPartner("koinly")!;
    const attributes = getPartnerLinkAttributes(partner, "tax-guide-sidebar");

    expect(attributes.target).toBe("_blank");
    expect(attributes.rel).toBe(PARTNER_REL);
    expect(attributes["data-analytics-id"]).toBe("partner-tax-tax-guide-sidebar-koinly");
    expect(attributes["data-analytics-label"]).toBe("Koinly tax tax-guide-sidebar");
    expect(attributes["data-partner-id"]).toBe("koinly");
    expect(attributes["data-partner-category"]).toBe("tax");
    expect(attributes["data-partner-placement"]).toBe("tax-guide-sidebar");
  });
});
