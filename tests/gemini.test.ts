import { afterEach, describe, expect, it, vi } from "vitest";
import { callAIWithFallback } from "../src/lib/gemini";

describe("Gemini request config", () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalThinkingBudget = process.env.GEMINI_THINKING_BUDGET;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    }
    if (originalThinkingBudget === undefined) {
      delete process.env.GEMINI_THINKING_BUDGET;
    } else {
      process.env.GEMINI_THINKING_BUDGET = originalThinkingBudget;
    }
  });

  it("disables Gemini 2.5 thinking by default for bounded publishing calls", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_THINKING_BUDGET;

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "ok" }] },
              finishReason: "STOP",
            },
          ],
          usageMetadata: {
            promptTokenCount: 4,
            candidatesTokenCount: 1,
            totalTokenCount: 5,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await callAIWithFallback("", "Write a short hook.", 64);

    expect(result.content).toBe("ok");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.generationConfig).toMatchObject({
      maxOutputTokens: 64,
      thinkingConfig: { thinkingBudget: 0 },
    });
  });
});
