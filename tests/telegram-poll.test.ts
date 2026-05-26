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
});
