import { describe, expect, it } from "vitest";
import { buildTelegramPollPayload } from "../scripts/lib/telegram-poll";

describe("buildTelegramPollPayload", () => {
  it("normalizes duplicate or short AI option lists before enforcing the Telegram poll shape", () => {
    const payload = buildTelegramPollPayload(
      {
        question: "Community Pulse: Which data point matters most today?",
        options: ["Liquidity depth", "Liquidity depth"],
      },
      "Community Pulse: Which market regime are we in right now?",
    );

    expect(payload.question).toBe("Community Pulse: Which data point matters most today?");
    expect(payload.options).toHaveLength(4);
    expect(new Set(payload.options.map((option) => option.toLowerCase())).size).toBe(4);
    expect(payload.options[0]).toBe("Liquidity depth");
    expect(payload.options).toContain("Momentum quality");
    expect(payload.options).toContain("Risk profile");
    expect(payload.options).toContain("Need more data");
  });

  it("filters out options containing unsafe editorial language and backfills with fallback options", () => {
    const payload = buildTelegramPollPayload(
      {
        question: "Community Pulse: What criteria matters most for watchlist selection?",
        options: [
          "Exchange liquidity",
          "Accumulation patterns", // triggers "accumulation instruction"
          "Developer activity",
          "Buy the dip signals", // triggers "investment instruction"
        ],
      },
      "Community Pulse: Which market regime are we in right now?",
    );

    expect(payload.question).toBe("Community Pulse: What criteria matters most for watchlist selection?");
    expect(payload.options).toHaveLength(4);
    expect(payload.options).toContain("Exchange liquidity");
    expect(payload.options).toContain("Developer activity");
    expect(payload.options).not.toContain("Accumulation patterns");
    expect(payload.options).not.toContain("Buy the dip signals");
    // Backfilled from FALLBACK_POLL_OPTIONS:
    expect(payload.options).toContain("Momentum quality");
    expect(payload.options).toContain("Liquidity depth");
  });

  it("falls back to fallbackQuestion if the AI-generated question contains unsafe editorial language", () => {
    const payload = buildTelegramPollPayload(
      {
        question: "Community Pulse: Is it time to accumulate top tokens?",
        options: ["Yes, aggressively", "Neutral wait", "Scale out slowly", "Need more data"],
      },
      "Community Pulse: What criteria matters most before entering watchlist?",
    );

    expect(payload.question).toBe("Community Pulse: What criteria matters most before entering watchlist?");
    expect(payload.options).toHaveLength(4);
  });

  it("falls back to all 4 default options if all AI options violate editorial policy", () => {
    const payload = buildTelegramPollPayload(
      {
        question: "Community Pulse: What is your primary focus?",
        options: [
          "Accumulate on dip",
          "Strong buy signals",
          "Take profit targets",
          "Moonshot potential",
        ],
      },
      "Community Pulse: What is your primary focus?",
    );

    expect(payload.options).toHaveLength(4);
    expect(payload.options).toEqual([
      "Momentum quality",
      "Liquidity depth",
      "Risk profile",
      "Need more data",
    ]);
  });
});

