import { afterEach, describe, expect, it, vi } from "vitest";
import { callAIWithFallback } from "../src/lib/gemini";

describe("Gemini request config", () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalThinkingBudget = process.env.GEMINI_THINKING_BUDGET;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    }
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
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
    expect(body.contents).toEqual([
      {
        parts: [{ text: "Write a short hook." }],
      },
    ]);
    expect(body.systemInstruction).toBeUndefined();
  });

  it("creates and uses explicit Gemini cached content for a reusable prompt prefix", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.ANTHROPIC_API_KEY;

    const cacheablePrefix = "Reusable article instruction. ".repeat(220);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: "cachedContents/article-prefix",
            usageMetadata: { totalTokenCount: 1200 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "ok" }] },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 1250,
              cachedContentTokenCount: 1200,
              candidatesTokenCount: 1,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const result = await callAIWithFallback(
      "Stable system instructions.",
      "Dynamic token data.",
      64,
      undefined,
      {
        promptCache: {
          namespace: "article-overview",
          cacheableUserPrefix: cacheablePrefix,
        },
      },
    );

    expect(result.content).toBe("ok");
    expect(result.cacheReadTokens).toBe(1200);

    const cacheRequest = fetchMock.mock.calls[0];
    expect(String(cacheRequest?.[0])).toContain("/cachedContents?key=test-key");
    const cacheBody = JSON.parse(String((cacheRequest?.[1] as RequestInit).body));
    expect(cacheBody).toMatchObject({
      model: "models/gemini-2.5-flash",
      ttl: "300s",
      systemInstruction: {
        parts: [{ text: "Stable system instructions." }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: cacheablePrefix }],
        },
      ],
    });

    const generateRequest = fetchMock.mock.calls[1];
    const generateBody = JSON.parse(String((generateRequest?.[1] as RequestInit).body));
    expect(generateBody).toMatchObject({
      cachedContent: "cachedContents/article-prefix",
      contents: [
        {
          role: "user",
          parts: [{ text: "Dynamic token data." }],
        },
      ],
    });
    expect(generateBody.systemInstruction).toBeUndefined();
  });

  it("marks a large Claude reusable prompt prefix with cache_control", async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

    const cacheablePrefix = "Reusable Claude article instruction. ".repeat(900);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "ok" }],
          usage: {
            input_tokens: 20,
            cache_creation_input_tokens: 4100,
            cache_read_input_tokens: 0,
            output_tokens: 1,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await callAIWithFallback(
      "Stable system instructions.",
      "Dynamic token data.",
      64,
      undefined,
      {
        promptCache: {
          namespace: "article-overview",
          cacheableUserPrefix: cacheablePrefix,
        },
      },
    );

    expect(result.content).toBe("ok");
    expect(result.cacheCreationTokens).toBe(4100);

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: cacheablePrefix,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: "Dynamic token data.",
          },
        ],
      },
    ]);
  });
});
