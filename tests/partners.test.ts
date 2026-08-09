import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

import {
  HOMEPAGE_PROMO_PARTNER_IDS,
  PARTNER_REL,
  PARTNERS,
  getExchangePartners,
  getExchangeReferralRecords,
  getHomepagePromoPartners,
  getPartner,
  getPartnerLinkAttributes,
  getPartnerPlacementUrl,
  getPartnersByCategory,
  isRestrictedForUsAudience,
} from "../src/lib/partners";
import { getWrappedPartnerIndex } from "../src/components/usePartnerRotation";

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

  it("adds placement attribution to affiliate partner URLs", () => {
    const tangem = getPartner("tangem")!;
    const bannerUrl = new URL(getPartnerPlacementUrl(tangem, "top-announcement-carousel"));
    const inlineUrl = new URL(getPartnerPlacementUrl(tangem, "homepage-inline-carousel"));

    expect(bannerUrl.searchParams.get("promocode")).toBe("TOKENRADAR");
    expect(bannerUrl.searchParams.get("utm_source")).toBe("tokenradar");
    expect(bannerUrl.searchParams.get("utm_medium")).toBe("affiliate");
    expect(bannerUrl.searchParams.get("utm_content")).toBe("top-announcement-carousel");
    expect(inlineUrl.searchParams.get("utm_content")).toBe("homepage-inline-carousel");
  });

  it("rotates every enabled wallet and tax partner on the homepage", () => {
    const partners = getHomepagePromoPartners();

    expect(partners.map((partner) => partner.id)).toEqual(HOMEPAGE_PROMO_PARTNER_IDS);
    expect(new Set(partners.map((partner) => partner.category))).toEqual(
      new Set(["hardware-wallet", "tax"]),
    );
    expect(partners).toHaveLength(6);

    for (const partner of partners) {
      const promoUrl = new URL(getPartnerPlacementUrl(partner, "homepage-inline-carousel"));
      expect(promoUrl.searchParams.get("utm_source")).toBe("tokenradar");
      expect(promoUrl.searchParams.get("utm_medium")).toBe("affiliate");
      expect(promoUrl.searchParams.get("utm_content")).toBe("homepage-inline-carousel");
    }
  });

  it("wraps manual and automatic rotation through the available partners", () => {
    expect(getWrappedPartnerIndex(0, 6)).toBe(0);
    expect(getWrappedPartnerIndex(6, 6)).toBe(0);
    expect(getWrappedPartnerIndex(-1, 6)).toBe(5);
    expect(getWrappedPartnerIndex(4, 0)).toBe(0);
  });

  it("keeps homepage advertisements out of search-result snippets", () => {
    const announcement = fs.readFileSync(path.join(process.cwd(), "src/components/PromoAnnouncementBar.tsx"), "utf-8");
    const carousel = fs.readFileSync(path.join(process.cwd(), "src/components/HomePartnerPromoCarousel.tsx"), "utf-8");

    expect(announcement).toContain("data-nosnippet");
    expect(carousel).toContain("data-nosnippet");
  });
});
