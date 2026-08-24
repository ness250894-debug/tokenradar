import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  DAILY_MOVERS_CAROUSEL_SLIDE_COUNT,
  DAILY_MOVERS_CAROUSEL_SLIDE_ROLES,
  generateDailyMoversCarousel,
} from "../src/lib/daily-movers-carousel-generator";
import {
  buildInstagramCarouselAltTexts,
  buildInstagramCarouselCta,
  buildInstagramMoverHashtags,
  buildInstagramMoversCaption,
  getInstagramMoverRejectionReasons,
  INSTAGRAM_MOVER_POLICY,
  type InstagramMoverCandidate,
  selectInstagramMovers,
} from "../src/lib/instagram-daily-movers";
import { getSocialArchetypeByKey } from "../src/lib/social-archetypes";
import { getSocialContentVariantByKey } from "../src/lib/social-variety";

function candidate(
  id: string,
  change24h: number,
  overrides: Partial<InstagramMoverCandidate["market"]> = {},
): InstagramMoverCandidate {
  return {
    id,
    symbol: id.slice(0, 4),
    name: `${id} token`,
    market: {
      price: 1.25,
      priceChange24h: change24h,
      marketCap: 200_000_000,
      marketCapRank: 120,
      volume24h: 20_000_000,
      ...overrides,
    },
  };
}

const qualifiedCandidates = [
  candidate("alpha", 18),
  candidate("bravo", 15),
  candidate("charlie", 12),
  candidate("delta", 10),
  candidate("echo", 8),
  candidate("foxtrot", 6),
];

function requireVariant() {
  const variant = getSocialContentVariantByKey("instagram-carousel", "quality_movers");
  if (!variant) throw new Error("Missing quality_movers fixture variant.");
  return variant;
}

function requireArchetype() {
  const archetype = getSocialArchetypeByKey("watchlist_shortlist");
  if (!archetype) throw new Error("Missing watchlist_shortlist fixture archetype.");
  return archetype;
}

describe("Instagram daily mover quality policy", () => {
  it("rejects undersized and noisy candidates with explicit reasons", () => {
    expect(getInstagramMoverRejectionReasons(
      candidate("tiny", 12, { marketCap: INSTAGRAM_MOVER_POLICY.minimumMarketCap - 1 }),
    )).toContain("below-market-cap-floor");
    expect(getInstagramMoverRejectionReasons(
      candidate("thin", 12, { volume24h: INSTAGRAM_MOVER_POLICY.minimumVolume24h - 1 }),
    )).toContain("below-volume-floor");
    expect(getInstagramMoverRejectionReasons(
      candidate("spike", INSTAGRAM_MOVER_POLICY.maximumPriceChange24h + 0.1),
    )).toContain("extreme-price-move");
    expect(getInstagramMoverRejectionReasons(
      candidate("churn", 12, { marketCap: 60_000_000, volume24h: 100_000_000 }),
    )).toContain("extreme-turnover");
  });

  it("selects five qualified movers in rank order without recycling cooldown tokens", () => {
    const selected = selectInstagramMovers(qualifiedCandidates, new Set(["alpha"]));

    expect(selected).toHaveLength(INSTAGRAM_MOVER_POLICY.requiredMoverCount);
    expect(selected.map((mover) => mover.id)).toEqual(["bravo", "charlie", "delta", "echo", "foxtrot"]);
    expect(selected.some((mover) => mover.id === "alpha")).toBe(false);
  });
});

describe("Instagram daily mover copy", () => {
  it("uses the selected archetype CTA in concise copy with at most five targeted hashtags", () => {
    const movers = selectInstagramMovers(qualifiedCandidates);
    const variant = requireVariant();
    const archetype = requireArchetype();
    const cta = buildInstagramCarouselCta(archetype, movers[0].symbol);
    const caption = buildInstagramMoversCaption(
      movers,
      variant,
      archetype,
      new Date("2026-08-24T14:54:00.000Z"),
    );
    const hashtags = caption.match(/#[A-Za-z0-9_]+/g) || [];

    expect(cta).toBe("Comment one ticker for the next evidence-first breakdown.");
    expect(caption).toContain(cta);
    expect(caption).toContain("Verdict: this is a filtered momentum lead");
    expect(caption).toContain("CoinGecko snapshot · 14:54 UTC");
    expect(hashtags).toEqual(buildInstagramMoverHashtags(movers, variant));
    expect(hashtags.length).toBeLessThanOrEqual(INSTAGRAM_MOVER_POLICY.maximumHashtags);
    expect(caption.split(/\s+/).length).toBeLessThan(130);
  });

  it("builds one accessible alt description for every story slide", () => {
    const movers = selectInstagramMovers(qualifiedCandidates);
    const altTexts = buildInstagramCarouselAltTexts(movers);

    expect(altTexts).toHaveLength(DAILY_MOVERS_CAROUSEL_SLIDE_COUNT);
    expect(altTexts[0]).toContain("Verdict slide");
    expect(altTexts[2]).toContain("Evidence comparison");
    expect(altTexts[3]).toContain("Risk slide");
    expect(altTexts[4]).toContain("Call-to-action slide");
  });
});

describe("generateDailyMoversCarousel", () => {
  it("renders the five-slide verdict-to-CTA story at Instagram portrait dimensions", async () => {
    const movers = selectInstagramMovers(qualifiedCandidates);
    const variant = requireVariant();
    const archetype = requireArchetype();
    const slides = await generateDailyMoversCarousel(movers, {
      generatedAt: new Date("2026-08-24T14:54:00.000Z"),
      variant,
      cta: buildInstagramCarouselCta(archetype, movers[0].symbol),
      ctaLabel: archetype.label,
    });

    expect(DAILY_MOVERS_CAROUSEL_SLIDE_ROLES).toEqual([
      "verdict",
      "evidence-board",
      "evidence-context",
      "risk",
      "cta",
    ]);
    expect(slides).toHaveLength(DAILY_MOVERS_CAROUSEL_SLIDE_COUNT);

    const metadata = await Promise.all(slides.map((slide) => sharp(slide).metadata()));
    for (const image of metadata) {
      expect(image.format).toBe("png");
      expect(image.width).toBe(1080);
      expect(image.height).toBe(1350);
    }
    expect(new Set(slides.map((slide) => slide.toString("base64"))).size).toBe(slides.length);
  }, 20_000);
});
