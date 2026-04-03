import { sleep } from "./utils";

export type AIResult = { 
  content: string; 
  promptTokens: number; 
  completionTokens: number; 
  provider: string; 
  model: string; 
  cost: number;
};

let lastGeminiRequestTime = 0;

async function callGeminiAPI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4000,
  retries: number = 3
): Promise<AIResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Add it to .env.local");
  const model = "gemini-3.1-flash-lite-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let lastError: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      if (i > 0) {
        console.log(`\n  [retry ${i}/${retries}] calling Gemini...`);
        await sleep(2000);
      }
      const elapsed = Date.now() - lastGeminiRequestTime;
      if (elapsed < 4100) {
        const waitTime = 4100 - elapsed;
        process.stdout.write(` [4s pace limit...] `);
        await sleep(waitTime);
      }
      
      lastGeminiRequestTime = Date.now();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: maxTokens }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const promptTokens = data.usageMetadata?.promptTokenCount || 0;
      const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
      
      const cost = (promptTokens / 1_000_000) * 0.075 + (completionTokens / 1_000_000) * 0.30;
      
      return { content: text.trim(), promptTokens, completionTokens, provider: "gemini", model, cost };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (i < retries) console.log(`  ⚠ Gemini failed (${lastError.message}), retrying...`);
    }
  }
  throw lastError;
}

async function callClaudeAPI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4000,
  retries: number = 3
): Promise<AIResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local");
  const model = "claude-haiku-4-5-20251001";

  let lastError: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      if (i > 0) {
        console.log(`\n  [retry ${i}/${retries}] calling Claude...`);
        await sleep(2000);
      }
      
      const messages = [{ role: "user", content: userPrompt }];
      
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt || undefined,
          messages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json() as {
        content?: { text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = data.content?.[0]?.text || "";
      const promptTokens = data.usage?.input_tokens || 0;
      const completionTokens = data.usage?.output_tokens || 0;
      
      const cost = (promptTokens / 1_000_000) * 1.0 + (completionTokens / 1_000_000) * 5.0;

      return { content: text.trim(), promptTokens, completionTokens, provider: "claude", model, cost };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (i < retries) console.log(`  ⚠ Claude failed (${lastError.message}), retrying...`);
    }
  }
  throw lastError;
}

export async function callAIWithFallback(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4000
): Promise<AIResult> {
  try {
    return await callGeminiAPI(systemPrompt, userPrompt, maxTokens);
  } catch (error) {
    console.log(`  ⚠ All Gemini attempts failed. Falling back to Claude...`);
    return await callClaudeAPI(systemPrompt, userPrompt, maxTokens);
  }
}

function getRiskGauge(score: number | undefined): string {
  if (score === undefined) return "N/A";
  const numScore = Math.min(10, Math.max(1, Math.round(score)));
  const dotsAmount = Math.ceil(numScore / 2); // 1-5 scale
  const green = "🟢".repeat(dotsAmount);
  const white = "⚪".repeat(5 - dotsAmount);
  return `${green}${white}`;
}

export interface MarketContext {
  riskScore?: number;
  growthPotentialIndex?: number;
  price?: number;
  priceChange24h?: number;
  marketCap?: number;
  /** Optional context about WHY this token was selected (trending, news, etc.) */
  trendingContext?: string;
  /** Time of day for contextualizing the post (e.g., Morning, Mid-day, Evening) */
  timeOfDay?: string;
  /** The persona/tone to use for generation (e.g., Analytical, Observer, Degen) */
  tone?: string;
  /** The specific reason this token was selected (e.g., top-gainer, safe-play) */
  selectionReason?: string;
}

/**
 * Generate a detailed analysis for a token with multi-model fallback.
 * 
 * Strategy: Gemini 3.1 Flash Lite -> Claude Haiku
 */
export async function generateTokenSummary(
  tokenName: string,
  symbol: string,
  description: string,
  metrics: MarketContext = {}
): Promise<string> {
  const priceStr = metrics.price !== undefined
    ? (metrics.price >= 1 ? `$${metrics.price.toFixed(2)}` : `$${metrics.price.toFixed(6)}`)
    : "N/A";
  const changeStr = metrics.priceChange24h !== undefined
    ? `${metrics.priceChange24h >= 0 ? "+" : ""}${metrics.priceChange24h.toFixed(2)}%`
    : "N/A";
  const mcapStr = metrics.marketCap
    ? metrics.marketCap >= 1e9
      ? `$${(metrics.marketCap / 1e9).toFixed(2)}B`
      : `$${(metrics.marketCap / 1e6).toFixed(0)}M`
    : "N/A";

  const trendingSection = metrics.trendingContext
    ? `\n    TRENDING CONTEXT:\n    ${metrics.trendingContext}\n    Use this context to make the analysis timely and relevant. Mention why this token is attracting attention right now.\n`
    : "";

  const timeContext = ""; // Omitted for TG posts as requested by the user
  const reasonContext = metrics.selectionReason ? `\n    SELECTION REASON: ${metrics.selectionReason}. Integrate this reason seamlessly into why you are covering the token right now.\n` : "";
  const toneInstruction = metrics.tone 
    ? `You represent the "${metrics.tone}" persona. Write in this exact natural tone, varying the style compared to a typical stale template.` 
    : `Ensure the tone is data-driven and matches a premium research platform.`;

  const riskGauge = getRiskGauge(metrics.riskScore);

  const prompt = `
    You are crafting a Telegram deep-dive update for TokenRadar.co.
    Provide a "Deep Insight & Analysis" for ${tokenName} (${symbol.toUpperCase()}).
    ${toneInstruction}
    
    MARKET DATA:
    Current Price: ${priceStr}
    24h Change: ${changeStr}
    Market Cap: ${mcapStr}
    Risk: ${riskGauge} (Score: ${metrics.riskScore ?? "N/A"}/10)
    Growth Index: ${metrics.growthPotentialIndex ?? "N/A"}/100
    ${trendingSection}${timeContext}${reasonContext}
    
    BACKGROUND:
    ${description.substring(0, 1500) || `${tokenName} is a cryptocurrency token tracked under the symbol ${symbol.toUpperCase()}.`}
    
    STRICT RULES:
    1. MANDATORY: The very first sentence of the post MUST begin exactly with the token ticker and name in bold, formatted like this: <b>$${symbol.toUpperCase()} (${tokenName})</b>. For example: "<b>$BTC (Bitcoin)</b> is currently showing strong...". Do not use any other introduction.
    2. TARGET LENGTH: approximately 700 - 1000 characters.
    3. Be analytical but also engaging. Structure your response into 2-3 readable paragraphs.
    4. Use bold <b> tags to create emphasis or short pseudo-subheaders (e.g., <b>The Catalyst:</b>). Do NOT use markdown headers (#) or HTML header tags (<h1>).
    5. You may sprinkle 2-3 relevant emojis throughout the post to break up text visually. Let loose and match the "hype" energy if the token is breaking out massively or trending hard.
    6. DO NOT provide financial advice.
    7. ABSOLUTELY NO NUMBERED OR BULLETED LISTS. Write entirely in paragraph form.
    8. Reference specific numbers from the market data provided, including the Risk gauge.
    9. End the post with a clear, non-financial-advice "Next Step" or actionable takeaway (e.g. "Watch for a volume spike...").
    10. If you provide a distinct price target, conclusion, or final verdict, wrap EXACTLY that sentence in Telegram HTML spoiler tags: <tg-spoiler>Your conclusion here</tg-spoiler>. Do not overuse this.
    11. No generic introductory or concluding filler — start directly with the insight.
  `;

  try {
    const result = await callAIWithFallback("", prompt, 2048);
    return result.content || "";
  } catch (error) {
    console.warn(`  ⚠ AI summary generation failed for ${tokenName} — both Gemini and Claude returned empty or errored.`);
    return "";
  }
}

/**
 * Generate a short, punchy Tweet tailored for X.
 * Employs time-of-day and persona variations, ensuring strict length limits to leave room for footers.
 * 
 * Strategy: Gemini 3.1 Flash Lite -> Claude Haiku
 */
export async function generateTweet(
  tokenName: string,
  symbol: string,
  metrics: MarketContext = {}
): Promise<string> {
  const priceStr = metrics.price !== undefined
    ? (metrics.price >= 1 ? `$${metrics.price.toFixed(2)}` : `$${metrics.price.toFixed(6)}`)
    : "N/A";
  const changeStr = metrics.priceChange24h !== undefined
    ? `${metrics.priceChange24h >= 0 ? "+" : ""}${metrics.priceChange24h.toFixed(2)}%`
    : "N/A";
  const mcapStr = metrics.marketCap
    ? metrics.marketCap >= 1e9
      ? `$${(metrics.marketCap / 1e9).toFixed(2)}B`
      : `$${(metrics.marketCap / 1e6).toFixed(0)}M`
    : "N/A";

  const timeContext = metrics.timeOfDay ? `TIME OF DAY: ${metrics.timeOfDay}. (e.g., GM for Morning).` : "";
  const reasonContext = metrics.selectionReason ? `REASON: ${metrics.selectionReason}.` : "";
  const toneInstruction = metrics.tone 
    ? `Adopt the "${metrics.tone}" persona. Write as a human navigating crypto.` 
    : `Write engaging and concise social copy.`;

  const riskGauge = getRiskGauge(metrics.riskScore);

  // Provide exactly instructions to keep it short so footer links won't be truncated.
  const prompt = `
    Write a single short tweet about ${tokenName} for TokenRadar's X account.
    ${toneInstruction}
    
    Data context:
    Price: ${priceStr}
    24h Change: ${changeStr}
    MCap: ${mcapStr}
    Risk: ${riskGauge}
    ${timeContext}
    ${reasonContext}
    
    STRICT RULES:
    1. TARGET LENGTH: MUST be cleanly under 160 characters.
    2. Write organically and integrate cashtags ($${symbol.toUpperCase()}) naturally into the sentences (e.g. "Watching $${symbol.toUpperCase()} break..."). Do NOT dump cashtags at the end.
    3. End the tweet with a strong Engagement Hook (a question to the audience like "Are we rotating capital or holding? 👇").
    4. Include your visual Risk gauge organically if it fits.
    5. Generate exactly 2 highly relevant, dynamic hashtags at the end (e.g. #L2 #Ethereum). Do not use generic tags like #Crypto. Do NOT include links.
    6. You can use 1 or 2 emojis if it fits the tone.
  `;

  try {
    const result = await callAIWithFallback("", prompt, 256);
    return result.content || "";
  } catch (error) {
    console.warn(`  ⚠ AI tweet generation failed for ${tokenName}.`);
    return "";
  }
}

/**
 * Generate a poll intro text for the Daily Interactive Poll.
 */
export async function generatePollHook(
  pollType: string,
  timeOfDay: string,
  tokenName?: string,
  symbol?: string,
  metrics?: MarketContext
): Promise<string> {
  const tokenCtx = symbol ? `Target Token: ${tokenName} ($${symbol.toUpperCase()}). ` : "";
  const priceCtx = metrics?.price !== undefined ? `Current Price: $${metrics.price.toFixed(4)}. ` : "";
  const changeCtx = metrics?.priceChange24h !== undefined ? `24h Change: ${metrics.priceChange24h.toFixed(2)}%. ` : "";
  
  const prompt = `
    Write a short hook (1 sentence) introducing a ${pollType} poll for TokenRadar's followers on X.
    Time of day: ${timeOfDay} (e.g. use GM if Morning).
    ${tokenCtx}${priceCtx}${changeCtx}
    
    Write like a human asking the community a question.
    STRICT RULES:
    1. Maximum 120 characters to leave room for poll options and hashtags.
    2. Do not include the actual poll options in your text.
    3. Do NOT include hashtags or links.
  `;

  try {
    const result = await callAIWithFallback("", prompt, 256);
    return result.content || "";
  } catch (error) {
    console.warn(`  ⚠ AI poll hook generation failed.`);
    // Fallback template
    return symbol ? `What's your move on $${symbol.toUpperCase()} today?` : `Which crypto narrative dominates this week?`;
  }
}
