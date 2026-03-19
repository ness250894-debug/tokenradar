import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Gemini API with retries.
 */
async function callGemini(model: string, prompt: string, retries: number = 3): Promise<string> {
  if (!GEMINI_API_KEY) return "";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  for (let i = 0; i <= retries; i++) {
    try {
      if (i > 0) {
        console.log(`  [retry ${i}/${retries}] calling ${model}...`);
        await sleep(2000);
      }

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        
        let fullText = "";
        let thoughtSignature = "";

        for (const part of parts) {
          if (part.text) {
            fullText += part.text;
          }
          if (part.thought_signature) {
            thoughtSignature = part.thought_signature;
          }
          if (part.thoughtSignature) {
            thoughtSignature = part.thoughtSignature;
          }
          if (part.functionCall?.thought_signature) {
            thoughtSignature = part.functionCall.thought_signature;
          }
        }

        if (thoughtSignature) {
          console.log(`  [Gemini 3.1] Captured thought signature (${thoughtSignature.length} chars)`);
        } else {
          console.log("  [Gemini 3.1] No thought signature found in response parts.");
        }

        return fullText.trim() || "";
      }

      const errText = await response.text();
      console.warn(`  ⚠ Gemini API error (${model}, attempt ${i + 1}): ${response.status} - ${errText}`);
      
      // Only retry on 503 (unavailable) or 429 (rate limit)
      if (response.status !== 503 && response.status !== 429) break;

    } catch (error) {
      console.warn(`  ⚠ Gemini fetch error (${model}, attempt ${i + 1}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return "";
}

/**
 * Call Claude API as final fallback.
 */
async function callClaude(prompt: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) return "";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (response.ok) {
      const data = await response.json() as any;
      return data.content?.[0]?.text?.trim() || "";
    }
    console.warn(`  ⚠ Claude API error: ${response.status}`);
  } catch (error) {
    console.warn(`  ⚠ Claude fetch error: ${error instanceof Error ? error.message : String(error)}`);
  }
  return "";
}

/**
 * Generate a detailed analysis for a token with multi-model fallback.
 * 
 * Strategy: Gemini 2.5 -> Gemini 1.5 -> Claude Haiku
 */
export async function generateTokenSummary(
  tokenName: string,
  symbol: string,
  description: string,
  metrics: any = {}
): Promise<string> {
  const prompt = `
    You are a senior crypto analyst at TokenRadar.co.
    Provide a "Deep Insight & Analysis" for ${tokenName} (${symbol.toUpperCase()}).
    
    DATA FOR CONTEXT:
    Description: ${description.substring(0, 1500)}
    Risk Score: ${metrics.riskScore || "N/A"}/10
    Growth Index: ${metrics.growthPotentialIndex || "N/A"}/10
    
    STRICT RULES:
    1. TARGET LENGTH: approximately 2000 - 2500 characters.
    2. Be analytical, professional, and objective.
    3. DO NOT use hype, FOMO, or financial advice.
    4. Cover technology, tokenomics, market position, and risks.
    5. Use HTML tags for formatting: <b>, <i>, <a>, <code>.
    6. Ensure the tone is data-driven and matches a premium research platform.
    7. No introductory or concluding filler — start directly with the analysis.
  `;

  // Try Gemini 3.1 Flash Lite Preview
  let text = await callGemini("gemini-3.1-flash-lite-preview", prompt, 3);
  if (text) return text;

  // Fallback to Gemini 1.5 Flash
  console.log(`  [fallback] gemini-3.1-flash-lite failed, trying gemini-1.5-flash...`);
  text = await callGemini("gemini-1.5-flash", prompt, 3);
  if (text) return text;

  // Final fallback to Claude
  console.log(`  [fallback] gemini-1.5 failed, trying Claude Haiku...`);
  return await callClaude(prompt);
}
