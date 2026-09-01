import { describe, expect, it } from "vitest";

import {
  formatMarketDataAttribution,
  validateSocialContent,
  type SocialContentFacts,
} from "../src/lib/social-content-validator";

const groundedFacts: SocialContentFacts = {
  tokenName: "Pump.fun",
  symbol: "PUMP",
  price: 0.0042,
  priceChange24h: 17,
  marketCap: 50_000_000,
  marketCapRank: 486,
  volume24h: 4_000_000,
  riskScore: 6,
  growthPotentialIndex: 44,
  githubCommits4Weeks: null,
  marketDataSource: "coingecko-live",
  marketDataAsOf: "2026-08-23T09:30:00.000Z",
};

describe("social content validator", () => {
  it("accepts entity-safe copy whose numbers and attribution match supplied facts", () => {
    const text = [
      "$PUMP (Pump.fun) moved +17.00% over 24h.",
      "Price: $0.004200. Market cap: $50M. Rank #486.",
      "Risk: 6/10. Growth Index: 44/100.",
      "CoinGecko snapshot, 2026-08-23 09:30 UTC",
    ].join("\n");

    expect(validateSocialContent(text, groundedFacts)).toEqual({ ok: true, issues: [] });
  });

  it("preserves PUMP entities while blocking generic pump hype", () => {
    expect(validateSocialContent("Pump.fun ($PUMP) explained.", groundedFacts).ok).toBe(true);

    const result = validateSocialContent("$PUMP could pump next.", groundedFacts);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "unsafe-language",
      value: "pump hype",
    }));
  });

  it("validates rendered Telegram text so HTML tags cannot split blocked claims", () => {
    for (const text of [
      "se<b>ll</b> now",
      "guaran<b>teed</b> returns",
      "volume is <b>strong</b>",
      "risk is <tg-spoiler>high</tg-spoiler>",
    ]) {
      expect(validateSocialContent(text, groundedFacts).ok).toBe(false);
    }
  });

  it("blocks the live Growth Index and developer-data conflation", () => {
    const result = validateSocialContent(
      "Growth Index measures real momentum through developer commits and activity.",
      { ...groundedFacts, githubCommits4Weeks: 12 },
    );

    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "unsupported-metric-explanation",
      "unsupported-developer-claim",
    ]));
  });

  it("blocks investment direction instead of accepting euphemisms", () => {
    const result = validateSocialContent(
      "Wait before entry or accumulation, then commit capital after confirmation.",
      groundedFacts,
    );

    expect(result.issues.filter((issue) => issue.code === "unsafe-language").map((issue) => issue.value))
      .toEqual(expect.arrayContaining([
        "entry instruction",
        "accumulation instruction",
        "capital instruction",
      ]));
  });

  it("rejects unsupported market sources and causal claim classes", () => {
    const result = validateSocialContent(
      "Institutional inflows and whale activity are the catalyst. Holder concentration, buy/sell ratio, futures positioning, and thin liquidity confirm it.",
      groundedFacts,
    );

    const values = result.issues
      .filter((issue) => issue.code === "unsupported-source-claim")
      .map((issue) => issue.value);
    expect(values).toEqual(expect.arrayContaining([
      "institutional activity",
      "whale or smart-money activity",
      "flow data",
      "an unverified catalyst or causal explanation",
      "holder concentration or distribution",
      "buy/sell ratio",
      "options or futures positioning",
      "liquidity quality",
    ]));
  });

  it("allows an absolute volume value but not an invented volume trend", () => {
    const absolute = validateSocialContent(
      "24h volume: $4M. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      groundedFacts,
    );
    expect(absolute.ok).toBe(true);

    const comparative = validateSocialContent("24h volume is surging.", groundedFacts);
    expect(comparative.issues).toContainEqual(expect.objectContaining({
      code: "unsupported-source-claim",
      value: "comparative volume",
    }));
  });

  it("rejects a derived volume-to-market-cap percentage that was not supplied", () => {
    const result = validateSocialContent(
      "Pump.fun reported volume/cap is 8.00%. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      groundedFacts,
    );

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "unsupported-number",
      value: "8.00%",
    }));
  });

  it("permits a comparative-volume phrase only when it is explicitly supplied", () => {
    const text = "24h volume is surging versus the seven-day average.";
    const result = validateSocialContent(text, {
      ...groundedFacts,
      suppliedContext: [text],
    });

    expect(result.issues).not.toContainEqual(expect.objectContaining({ value: "comparative volume" }));
  });

  it("rejects invented numbers and missing snapshot attribution", () => {
    const result = validateSocialContent("$PUMP moved +22% at $0.005000.", groundedFacts);

    expect(result.issues.filter((issue) => issue.code === "unsupported-number").map((issue) => issue.value))
      .toEqual(expect.arrayContaining(["+22%", "$0.005000"]));
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "missing-market-attribution",
      value: formatMarketDataAttribution(groundedFacts),
    }));
  });

  it("binds currency claims to their metric labels", () => {
    const result = validateSocialContent(
      "Price: $1B. Market cap: $1. Volume: $2B. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      {
        ...groundedFacts,
        price: 1,
        marketCap: 1_000_000_000,
        volume24h: 2_000_000_000,
      },
    );

    expect(result.issues.filter((issue) => issue.code === "unsupported-number"))
      .toHaveLength(2);
  });

  it("does not reassign a supplied-context percentage to the token", () => {
    const reassigned = validateSocialContent(
      "$PUMP moved +5%. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      { ...groundedFacts, suppliedContext: ["Bitcoin dominance: +5%"] },
    );
    expect(reassigned.issues).toContainEqual(expect.objectContaining({
      code: "unsupported-number",
      value: "+5%",
    }));

    const groundedContext = validateSocialContent(
      "Bitcoin dominance: +5%. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      { ...groundedFacts, suppliedContext: ["Bitcoin dominance: +5%"] },
    );
    expect(groundedContext.issues).not.toContainEqual(expect.objectContaining({
      code: "unsupported-number",
    }));
  });

  it("does not reassign the token percentage to dominance or sector claims", () => {
    for (const text of ["Bitcoin dominance: 17%.", "Sector X: 17%."]) {
      const result = validateSocialContent(text, groundedFacts);
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: "unsupported-number",
      }));
    }
  });

  it("does not bind another named asset's move to the target token", () => {
    const result = validateSocialContent(
      "Bitcoin moved 17%. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      { ...groundedFacts, suppliedContext: ["Bitcoin moved 3% in 24h"] },
    );

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "unsupported-number",
      value: "17%",
    }));
  });

  it("binds percentages to the nearest subject in multi-asset copy", () => {
    for (const text of [
      "Bitcoin moved 17%, while Pump.fun was flat.",
      "Pump.fun vs Bitcoin: Bitcoin moved 17%.",
    ]) {
      expect(validateSocialContent(text, groundedFacts).issues).toContainEqual(
        expect.objectContaining({ code: "unsupported-number", value: "17%" }),
      );
    }
  });

  it("validates label-bound bare Risk and Growth scores", () => {
    const result = validateSocialContent("Risk Score: 9. Growth Index: 99.", groundedFacts);

    expect(result.issues.filter((issue) => issue.code === "unsupported-number"))
      .toHaveLength(2);
  });

  it("requires discrete Risk and Growth scores to match exactly", () => {
    const result = validateSocialContent("Risk Score: 6.1/10. Growth Index: 44.1/100.", groundedFacts);
    expect(result.issues.filter((issue) => issue.code === "unsupported-number")).toHaveLength(2);
  });

  it("binds score ratios and ranks to their declared metric labels", () => {
    for (const text of [
      "Security score: 6/10.",
      "Community score: 44/100.",
      "Pump.fun ranks #486 by 24h volume.",
    ]) {
      expect(validateSocialContent(text, groundedFacts).issues).toContainEqual(
        expect.objectContaining({ code: "unsupported-number" }),
      );
    }
  });

  it("binds percentage direction and timeframe to the supplied 24h change", () => {
    const attribution = "CoinGecko snapshot, 2026-08-23 09:30 UTC";
    expect(validateSocialContent(`Pump.fun fell 17% in 24h. ${attribution}`, groundedFacts).issues)
      .toContainEqual(expect.objectContaining({ code: "unsupported-number" }));
    expect(validateSocialContent(`Pump.fun gained -17% in 24h. ${attribution}`, {
      ...groundedFacts,
      priceChange24h: -17,
    }).issues).toContainEqual(expect.objectContaining({ code: "unsupported-number" }));
    expect(validateSocialContent(`Pump.fun fell 17% in 24h. ${attribution}`, {
      ...groundedFacts,
      priceChange24h: -17,
    }).issues).not.toContainEqual(expect.objectContaining({ code: "unsupported-number" }));
    for (const timeframe of ["over 7d", "this week", "over 30 days"]) {
      expect(validateSocialContent(`Pump.fun gained 17% ${timeframe}. ${attribution}`, groundedFacts).issues)
        .toContainEqual(expect.objectContaining({ code: "unsupported-number" }));
    }
    for (const text of [
      "Pump.fun plunged 17% in 24h.",
      "Pump.fun dipped 17% in 24h.",
      "Pump.fun was flat at 17%.",
      "Pump.fun gained 17% over the past seven days.",
      "Pump.fun gained 17% YTD.",
      "Pump.fun gained 17% since Monday.",
      "Pump.fun gained 17% all time.",
    ]) {
      expect(validateSocialContent(`${text} ${attribution}`, groundedFacts).issues)
        .toContainEqual(expect.objectContaining({ code: "unsupported-number" }));
    }
  });

  it("does not mistake a directional word used as the token symbol for price direction", () => {
    const roseFacts = {
      ...groundedFacts,
      tokenName: "Oasis",
      symbol: "ROSE",
      priceChange24h: -0.95103,
    };

    for (const subject of ["ROSE", "Oasis (ROSE)"]) {
      expect(validateSocialContent(
        `${subject} moved -0.95% in the supplied daily snapshot. CoinGecko snapshot, 2026-08-23 09:30 UTC`,
        roseFacts,
      )).toEqual({ ok: true, issues: [] });
    }
  });

  it("does not interpret scaled currency amounts as non-24h timeframes", () => {
    const ponsFacts: SocialContentFacts = {
      tokenName: "Pons",
      symbol: "PONS",
      price: 0.069268,
      priceChange24h: 61.4,
      marketCap: 49_476_249,
      marketCapRank: 454,
      volume24h: 15_970_073,
      marketDataSource: "coingecko-live",
      marketDataAsOf: "2026-08-24T01:55:20.000Z",
    };
    const attribution = "CoinGecko snapshot, 2026-08-24 01:55 UTC";
    const valid = validateSocialContent(
      `Setup: +61.40% over 24h, price $0.069268, market cap $49M. ${attribution}`,
      ponsFacts,
    );
    expect(valid).toEqual({ ok: true, issues: [] });

    for (const marketCap of ["$49m", "€49M", "£49M"]) {
      const result = validateSocialContent(
        `Pons gained +61.40% over 24h at a ${marketCap} market cap. ${attribution}`,
        ponsFacts,
      );
      expect(result.issues).not.toContainEqual(expect.objectContaining({
        code: "unsupported-number",
        value: "+61.40%",
      }));
    }

    for (const claim of [
      "Pons gained +61.40% over 7d at a $49M market cap.",
      "Pons gained +61.40% this week at a $49M market cap.",
      "Pons gained +61.40% YTD at a $49M market cap.",
      "Pons gained +61.40% since Monday at a $49M market cap.",
      "Pons gained +61.40%, over 7d, at a $49M market cap.",
      "Pons gained +61.40%; over 7d at a $49M market cap.",
    ]) {
      const invalid = validateSocialContent(`${claim} ${attribution}`, ponsFacts);
      expect(invalid.issues).toContainEqual(expect.objectContaining({
        code: "unsupported-number",
        value: "+61.40%",
      }));
    }
  });

  it("rejects unsupported word-number and multiplier claims", () => {
    for (const text of [
      "Pump.fun has ten million users.",
      "Pump.fun is the third-largest crypto.",
      "Pump.fun doubled this week.",
      "Pump.fun did a two-x move.",
    ]) {
      expect(validateSocialContent(text, groundedFacts).issues).toContainEqual(
        expect.objectContaining({ code: "unsupported-number" }),
      );
    }
  });

  it("rejects unsupported qualitative market and score trends", () => {
    for (const text of [
      "Pump.fun adoption is surging.",
      "Network activity is rising.",
      "Demand is accelerating.",
      "The community is growing quickly.",
      "Usage is at an all-time high.",
      "Risk is elevated.",
      "Growth is strong.",
    ]) {
      expect(validateSocialContent(text, groundedFacts).ok).toBe(false);
    }
  });

  it("rejects unsupported valuation, momentum, size, comparison, and popularity readings", () => {
    for (const text of [
      "Pump.fun looks cheap.",
      "Pump.fun made a massive move.",
      "Momentum is bullish.",
      "Pump.fun is breaking out.",
      "Volatility is high.",
      "Pump.fun is a large-cap asset.",
      "Trading is busy and participation is strong.",
      "Pump.fun has high upside and room to run.",
      "Pump.fun is viral with a huge community.",
      "Pump.fun outperformed Ethereum.",
      "Pump.fun is the market leader and most traded.",
      "Pump.fun has higher volume than Ethereum.",
    ]) {
      expect(validateSocialContent(text, groundedFacts).ok).toBe(false);
    }
  });

  it("rejects unsupported TVL, fee, supply, transaction, and superlative claims", () => {
    for (const text of [
      "Pump.fun TVL rose this week.",
      "Pump.fun network fees fell today.",
      "Pump.fun processed millions of transactions.",
      "Pump.fun is the largest smart-contract platform.",
      "Pump.fun circulating supply fell.",
      "Pump.fun usage hit a record.",
    ]) {
      expect(validateSocialContent(text, groundedFacts).ok).toBe(false);
    }
  });

  it("normalizes a Unicode minus before validating percentages", () => {
    const result = validateSocialContent(
      "$PUMP moved −22%. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      { ...groundedFacts, priceChange24h: 22 },
    );

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "unsupported-number",
      value: "−22%",
    }));
  });

  it("rejects bare rank and audience-count hallucinations", () => {
    const rank = validateSocialContent(
      "$PUMP is #999 by market cap. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      groundedFacts,
    );
    expect(rank.issues).toContainEqual(expect.objectContaining({
      code: "unsupported-number",
      value: "#999 by market cap",
    }));

    const users = validateSocialContent("Pump.fun has 10 million users.", groundedFacts);
    expect(users.issues).toContainEqual(expect.objectContaining({
      code: "unsupported-number",
      value: "10",
    }));
  });

  it("uses N/A for unavailable developer data while preserving a supplied zero", () => {
    const unavailable = validateSocialContent("Developer: No recent activity.", groundedFacts);
    expect(unavailable.issues).toContainEqual(expect.objectContaining({
      code: "unsupported-developer-claim",
    }));

    const zero = validateSocialContent("Developer: 0 GitHub commits in 4 weeks.", {
      ...groundedFacts,
      githubCommits4Weeks: 0,
    });
    expect(zero.ok).toBe(true);
  });

  it("binds currencies, audience counts, and commits to their supplied labels and window", () => {
    const facts = {
      ...groundedFacts,
      price: 50_000,
      twitterFollowers: 10_000,
      redditSubscribers: 20_000,
      githubCommits4Weeks: 100,
    };
    for (const text of [
      "Pump.fun generated $50,000 in fees. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      "Pump.fun has 10,000 followers on Discord.",
      "Pump.fun has 20,000 subscribers on YouTube.",
      "Pump.fun logged 100 GitHub commits this week.",
    ]) {
      expect(validateSocialContent(text, facts).issues).toContainEqual(
        expect.objectContaining({ code: "unsupported-number" }),
      );
    }
    expect(validateSocialContent("Community: 10,000 Twitter followers, 20,000 Reddit subscribers.", facts).ok)
      .toBe(true);
    expect(validateSocialContent("Developer: 100 GitHub commits in 4 weeks.", facts).ok).toBe(true);
  });

  it("rejects spelled-out quantitative claims", () => {
    for (const text of [
      "Pump.fun gained five percent.",
      "Pump.fun price is one dollar.",
      "Risk score nine out of ten.",
      "Pump.fun ranked first.",
      "Market cap one billion dollars.",
    ]) {
      expect(validateSocialContent(text, groundedFacts).issues).toContainEqual(
        expect.objectContaining({ code: "unsupported-number" }),
      );
    }
  });

  it("does not reassign matching token facts to another named asset", () => {
    const facts = {
      ...groundedFacts,
      price: 100,
      marketCap: 1_000_000_000,
      volume24h: 50_000_000,
      marketCapRank: 10,
      riskScore: 7,
      growthPotentialIndex: 80,
    };
    for (const text of [
      "Ethereum price is $100. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      "Ethereum market cap is $1B. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      "Ethereum volume is $50M. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      "Ethereum ranks #10 by market cap. CoinGecko snapshot, 2026-08-23 09:30 UTC",
      "Ethereum Risk Score: 7/10.",
      "Ethereum Growth Index: 80/100.",
    ]) {
      expect(validateSocialContent(text, facts).issues).toContainEqual(
        expect.objectContaining({ code: "unsupported-number" }),
      );
    }
  });

  it("treats leading metric qualifiers as labels without weakening cross-asset checks", () => {
    const facts = {
      ...groundedFacts,
      price: 1,
      marketCap: 1_000_000_000,
      volume24h: 50_000_000,
    };
    const attribution = "CoinGecko snapshot, 2026-08-23 09:30 UTC";

    for (const text of [
      "Current price: $1.",
      "Reported market cap: $1B.",
      "Supplied 24h volume: $50M.",
    ]) {
      expect(validateSocialContent(`${text} ${attribution}`, facts))
        .toEqual({ ok: true, issues: [] });
    }

    expect(validateSocialContent(
      `Reported Ethereum market cap is $1B. ${attribution}`,
      facts,
    ).issues).toContainEqual(expect.objectContaining({ code: "unsupported-number" }));
  });

  it("binds each currency amount to its nearest metric label", () => {
    const facts = { ...groundedFacts, price: 1, marketCap: 1_000_000_000, volume24h: 50_000_000 };
    for (const text of [
      "Market cap is $1B and price is $1B.",
      "Volume is $50M and price is $50M.",
      "Market cap is $1B while volume is $1B.",
    ]) {
      expect(validateSocialContent(`${text} CoinGecko snapshot, 2026-08-23 09:30 UTC`, facts).issues)
        .toContainEqual(expect.objectContaining({ code: "unsupported-number" }));
    }
  });
});
