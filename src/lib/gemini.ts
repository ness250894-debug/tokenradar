import { sleep, Mutex, ensureHtmlTagsClosed } from "./shared-utils";
import { fetchWithRetry } from "./fetch-with-retry";
import { formatErrorForLog } from "./utils";

export type AIResult = {
  content: string;
  promptTokens: number;
  completionTokens: number;
  provider: string;
  model: string;
  cost: number;
  finishReason?: string;
};

const aiMutex = new Mutex();
let lastGeminiRequestTime = 0;

export const PRIMARY_MODEL = "gemini-2.5-flash";
export const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_OUTPUT_TOKENS = 4000;
const DEFAULT_AI_RETRIES = 3;
const AI_RETRY_DELAY_MS = 2000;
const GEMINI_MIN_REQUEST_INTERVAL_MS = 4100;
const GEMINI_INPUT_COST_PER_MILLION = 0.10;
const GEMINI_OUTPUT_COST_PER_MILLION = 0.40;
const CLAUDE_INPUT_COST_PER_MILLION = 0.80;
const CLAUDE_OUTPUT_COST_PER_MILLION = 4.00;

async function callGeminiAPI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = DEFAULT_MAX_OUTPUT_TOKENS,
  retries: number = DEFAULT_AI_RETRIES,
  jsonSchema?: object
): Promise<AIResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Add it to .env.local");
  const model = PRIMARY_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let lastError: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      if (i > 0) {
        console.info(`\n  [retry ${i}/${retries}] calling Gemini...`);
        await sleep(AI_RETRY_DELAY_MS);
      }

      const result = await aiMutex.runExclusive(async () => {
        const elapsed = Date.now() - lastGeminiRequestTime;
        if (elapsed < GEMINI_MIN_REQUEST_INTERVAL_MS) {
          const waitTime = GEMINI_MIN_REQUEST_INTERVAL_MS - elapsed;
          process.stdout.write(` [4s pace limit...] `);
          await sleep(waitTime);
        }

        lastGeminiRequestTime = Date.now();

        const body = JSON.stringify({
            contents: [{ 
              parts: [{ 
                text: systemPrompt ? `SYSTEM: ${systemPrompt}\n\nUSER: ${userPrompt}` : userPrompt 
              }] 
            }],
            generationConfig: {
              maxOutputTokens: maxTokens,
              ...(jsonSchema ? {
                responseMimeType: "application/json",
                responseSchema: jsonSchema
              } : {})
            }
          });
        const response = await fetchWithRetry(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) {
          console.error("Gemini API returned no candidates. Raw response:", JSON.stringify(data));
          throw new Error("Gemini API returned no candidates.");
        }

        const candidate = data.candidates[0];
        const text = candidate.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
        const promptTokens = data.usageMetadata?.promptTokenCount || 0;
        const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
        const finishReason = candidate.finishReason;


        const cost =
          (promptTokens / 1_000_000) * GEMINI_INPUT_COST_PER_MILLION +
          (completionTokens / 1_000_000) * GEMINI_OUTPUT_COST_PER_MILLION;

        return { content: text.trim(), promptTokens, completionTokens, provider: "gemini", model, cost, finishReason };
      });

      return result;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (i < retries) console.info(`  ⚠ Gemini failed (${lastError.message}), retrying...`);
    }
  }
  throw lastError;
}

async function callClaudeAPI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = DEFAULT_MAX_OUTPUT_TOKENS,
  retries: number = DEFAULT_AI_RETRIES,
  jsonSchema?: object
): Promise<AIResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set. Claude fallback unavailable.");
  const model = FALLBACK_MODEL;

  let lastError: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      if (i > 0) {
        console.info(`\n  [retry ${i}/${retries}] calling Claude...`);
        await sleep(AI_RETRY_DELAY_MS);
      }

      const messages = [{ role: "user", content: userPrompt }];

      const response = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
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
          ...(jsonSchema ? {
            tools: [{
              name: "generate_article_sections",
              description: "Generate the structured sections of the token article.",
              input_schema: jsonSchema
            }],
            tool_choice: { type: "tool", name: "generate_article_sections" }
          } : {})
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude HTTP ${response.status}: ${errorText}`);
      }

      interface ClaudeToolUse {
        type: 'tool_use';
        id: string;
        name: string;
        input: unknown;
      }

      interface ClaudeContentBlock {
        type: 'text' | 'tool_use';
        text?: string;
        id?: string;
        name?: string;
        input?: unknown;
      }

      interface ClaudeResponse {
        content: ClaudeContentBlock[];
        usage?: { input_tokens?: number; output_tokens?: number };
      }

      const data = await response.json() as ClaudeResponse;

      let text = "";
      if (jsonSchema && data.content) {
        const toolUse = data.content.find((c): c is ClaudeToolUse => c.type === "tool_use");
        if (toolUse && toolUse.input) {
          text = JSON.stringify(toolUse.input);
        } else {
          text = data.content[0]?.text || "";
        }
      } else {
        text = data.content[0]?.text || "";
      }

      const promptTokens = data.usage?.input_tokens || 0;
      const completionTokens = data.usage?.output_tokens || 0;

      const cost =
        (promptTokens / 1_000_000) * CLAUDE_INPUT_COST_PER_MILLION +
        (completionTokens / 1_000_000) * CLAUDE_OUTPUT_COST_PER_MILLION;

      return { content: text.trim(), promptTokens, completionTokens, provider: "claude", model, cost, finishReason: "STOP" };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (i < retries) console.info(`  ⚠ Claude failed (${lastError.message}), retrying...`);
    }
  }
  throw lastError;
}

function isTechnicalRefusal(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = [
    "i (don't|do not) have access to (the|this) (image|picture)",
    "as an ai language model",
    "as a large language model",
    "i am sorry, (but )?i cannot",
    "access to the image is not possible",
    "i cannot (see|process|view) (this|the) image",
    "i'm an ai and i don't have eyes",
    "technical constraints prevent me",
    "i'm sorry, i can't do that",
    "i don't have (the )?context",
  ];

  return patterns.some(pattern => new RegExp(pattern, 'i').test(lower));
}

export async function callAIWithFallback(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = DEFAULT_MAX_OUTPUT_TOKENS,
  jsonSchema?: object
): Promise<AIResult> {
  try {
    // Try Gemini first (primary — lower cost)
    const result = await callGeminiAPI(systemPrompt, userPrompt, maxTokens, DEFAULT_AI_RETRIES, jsonSchema);
    if (isTechnicalRefusal(result.content)) {
      console.warn(`  ⚠ Gemini returned a technical refusal. Falling back to Claude...`);
      throw new Error("AI Technical Refusal");
    }
    if (result.finishReason && result.finishReason !== "STOP") {
      console.warn(`  ⚠ Gemini finished with reason: ${result.finishReason}. Falling back to Claude...`);
      throw new Error(`AI Truncated: ${result.finishReason}`);
    }
    return result;
  } catch (error) {
    console.warn(`  ⚠ Gemini primary failed or refused. Falling back to Claude... Gemini error: ${formatErrorForLog(error)}`);
    const result = await callClaudeAPI(systemPrompt, userPrompt, maxTokens, DEFAULT_AI_RETRIES, jsonSchema);
    return result;
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
  marketCapRank?: number;
  /** Optional context about WHY this token was selected (trending, news, etc.) */
  trendingContext?: string;
  /** Global market context (e.g., "$2.4T cap, +1.2% 24h") */
  globalStats?: string;
  /** Sector performance context (e.g., "AI Tokens lead with +12%") */
  sectorPerformance?: string;
  /** Time of day for contextualizing the post (e.g., Morning, Mid-day, Evening) */
  timeOfDay?: string;
  /** The persona/tone to use for generation (e.g., Analytical, Observer, Degen) */
  tone?: string;
  /** The specific reason this token was selected (e.g., top-gainer, safe-play) */
  selectionReason?: string;
  // Social & Developer Stats
  twitterFollowers?: number;
  redditSubscribers?: number;
  githubCommits4Weeks?: number;
  /** Real-time social buzz/tweets found via X Search */
  socialContext?: string;
  /** Calculated sentiment score 0-1 (0 = bearish/scam, 1 = bullish/legit) */
  sentimentScore?: number;
}

/**
 * Generate a detailed analysis for a token with multi-model fallback.
 * 
 * Strategy: Gemini 2.5 Flash (primary) -> Claude Haiku 4.5 (fallback)
 */
export async function generateTokenSummary(
  tokenName: string,
  symbol: string,
  description: string,
  metrics: MarketContext = {},
  maxChars: number = 800
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
    You are an AI Analyst for TokenRadar.co, leveraging real-time market intelligence from the CoinGecko AI Agent Hub.
    Provide a "Deep Insight & Analysis" for ${tokenName} (${symbol.toUpperCase()}).
    ${toneInstruction}
    
    MARKET DATA (Source: CoinGecko):
    Current Price: ${priceStr}
    24h Change: ${changeStr}
    Market Cap: ${mcapStr} (Rank: #${metrics.marketCapRank ?? "N/A"})
    Risk Factor: ${riskGauge} (Score: ${metrics.riskScore ?? "N/A"}/10)
    Growth Index: ${metrics.growthPotentialIndex ?? "N/A"}/100
    COMMUNITY: ${metrics.twitterFollowers ? `${metrics.twitterFollowers.toLocaleString()} Twitter followers, ` : ""}${metrics.redditSubscribers ? `${metrics.redditSubscribers.toLocaleString()} Reddit subs` : ""}
    DEVELOPER: ${metrics.githubCommits4Weeks ? `${metrics.githubCommits4Weeks} GitHub commits (4-weeks)` : "No recent activity"}
    ${metrics.globalStats ? `GLOBAL MARKET: ${metrics.globalStats}\n    ` : ""}${metrics.sectorPerformance ? `SECTOR PERFORMANCE: ${metrics.sectorPerformance}\n    ` : ""}${trendingSection}${timeContext}${reasonContext}
    
    BACKGROUND CONTEXT:
    ${description.substring(0, 1500) || `${tokenName} is a cryptocurrency token tracked under the symbol ${symbol.toUpperCase()}.`}
    
    STRICT ANALYSIS RULES:
    1. MANDATORY: The very first sentence MUST begin exactly with: $${symbol.toUpperCase()} (${tokenName}). (Do NOT bold the cashtag).
    2. DATA DENSITY: Avoid generic fluff. Reference specific numbers (Price, MCAP, Risk) to ground your analysis. Use <b> tags for these numbers.
    3. INSIGHT: Explain the *implication* of the data. 
    4. ATTRIBUTION: Naturally mention that the data is powered by CoinGecko.
    5. HARD LIMIT: Your total output MUST be under ${Math.floor(maxChars / 6)} words. This is a hard technical limit. Priority is data over fluff.
    6. FORMATTING: Use <b> tags for emphasis. NO numbered lists. No HTML headers.
    7. SPICY ENGAGEMENT: Use exactly 1 or 2 emojis.
    8. ACTIONABLE TAKEAWAY: End with a specific "Next Step" or tactical observation.
    9. SPOILER CONCLUSION: Wrap your final "verdict" sentence in <tg-spoiler> tags (e.g., <tg-spoiler>The verdict is bullish.</tg-spoiler>).
    10. EXTERNAL LINKS: NEVER include URLs, external links, or ads.
  `;

  try {
    const result = await callAIWithFallback("", prompt, 2048);
    const content = result.content || "";
    // Ensure critical HTML tags are closed to avoid Telegram parsing errors
    return ensureHtmlTagsClosed(content, ["b", "tg-spoiler"]);
  } catch (_error) {
    console.warn(`  ⚠ AI summary generation failed for ${tokenName} — both Gemini and Claude returned empty or errored.`);
    return "";
  }
}

/**
 * Generate a short, punchy Tweet tailored for X.
 * Employs time-of-day and persona variations, ensuring strict length limits to leave room for footers.
 * 
 * Strategy: Gemini 2.5 Flash (primary) -> Claude Haiku 4.5 (fallback)
 */
export async function generateTweet(
  tokenName: string,
  symbol: string,
  metrics: MarketContext = {},
  maxChars: number = 250
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
  const riskGauge = getRiskGauge(metrics.riskScore);

  // Vibe Check Logic: Adjust tone based on social sentiment
  let vibeTone = metrics.tone || "Analytical Observer";
  if (metrics.sentimentScore !== undefined) {
    if (metrics.sentimentScore >= 0.7) {
      vibeTone = "Aggressive Spotlight (Extremely Bullish)";
    } else if (metrics.sentimentScore < 0.3) {
      vibeTone = "Conservative Researcher (Cautionary/Neutral)";
    }
  }

  const socialContextSection = metrics.socialContext
    ? `\n    REAL-TIME SOCIAL BUZZ:\n    ${metrics.socialContext.substring(0, 1000)}\n    Use these tweets to reference current community sentiment or specific narratives.\n`
    : "";

  // Provide exactly instructions to keep it short so footer links won't be truncated.
  const prompt = `
    Write a short high-engagement tweet for TokenRadar about ${tokenName} using CoinGecko and X social intelligence.
    PERSONA: Adopt the "${vibeTone}" persona. Write as a human navigating crypto.
    ${socialContextSection}
    
    Data context (Source: CoinGecko):
    Price: ${priceStr} | 24h: ${changeStr} | MCap: ${mcapStr}
    Risk Profile: ${riskGauge}
    ${metrics.globalStats ? `Global Market: ${metrics.globalStats}\n    ` : ""}${metrics.sectorPerformance ? `Sector: ${metrics.sectorPerformance}\n    ` : ""}${timeContext}
    ${reasonContext}
    
    STRICT X RULES:
    1. OUTPUT: Return ONLY the tweet text.
    2. HARD LIMIT: Your output MUST be under ${maxChars} characters. Aim for high density.
    3. CASHTAG: Use EXACTLY ONE cashtag ($${symbol.toUpperCase()}). No other symbols.
    4. PRICING: Write prices as plain numbers (e.g. '0.84', not '$0.84').
    5. SPARK DEBATE: End with a strong, data-driven question to drive replies.
    6. HASHTAGS: Exactly 1 or 2 niche tags at the end.
    7. TONE: Punchy, analytical.
    8. EXTERNAL LINKS: NEVER include URLs.
  `;

  try {
    const result = await callAIWithFallback("", prompt, 1024);
    return result.content || "";
  } catch (_error) {
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
    4. Do NOT use cashtags (e.g. $BTC, $ETH). The cashtag will be added separately by the system.
    5. Do NOT use dollar signs for prices — write prices as plain numbers (e.g. '21.64' not '$21.64').
    6. EXTERNAL LINKS: NEVER include URLs, external links, third-party domains, or ads. The only permitted site is tokenradar.co.
  `;

  try {
    const result = await callAIWithFallback("", prompt, 512);
    return result.content || "";
  } catch (_error) {
    console.warn(`  ⚠ AI poll hook generation failed.`);
    // Fallback template
    return symbol ? `What's your move on $${symbol.toUpperCase()} today?` : `Which crypto narrative dominates this week?`;
  }
}

/**
 * Generate highly optimized YouTube Shorts metadata (Title and Description).
 * Output format is JSON containing { title, description }
 */
export async function generateYoutubeMetadata(
  tokenName: string,
  symbol: string,
  metrics: MarketContext = {}
): Promise<{ title: string; description: string }> {
  const priceStr = metrics.price !== undefined
    ? (metrics.price >= 1 ? `$${metrics.price.toFixed(2)}` : `$${metrics.price.toFixed(6)}`)
    : "N/A";
  const changeStr = metrics.priceChange24h !== undefined
    ? `${metrics.priceChange24h >= 0 ? "+" : ""}${metrics.priceChange24h.toFixed(2)}%`
    : "N/A";

  const reasonContext = metrics.selectionReason ? `REASON: ${metrics.selectionReason}.` : "";

  const prompt = `
    You are an expert YouTube SEO manager. Write the Title and Description for a YouTube Shorts video about ${tokenName} ($${symbol.toUpperCase()}).

    Data context:
    Price: ${priceStr}
    24h Change: ${changeStr}
    ${reasonContext}

    STRICT SEO RULES:
    1. TITLE: Front-load the keywords. Must be under 60 characters. Example format: "TokenName ($SYMBOL) Breakout! 🚀 Why It's Surging".
    2. DESCRIPTION HOOK: Start the description with a powerful 1-2 sentence hook explaining why this token is moving today. Incorporate the price or 24h change naturally into the text.
    3. BRANDING: Directly after the hook, add a single line: "🌐 Full data report & analytics: https://tokenradar.co"
    4. HASHTAGS: At the very end of the description, include exactly 3 hashtags. The first MUST be #Shorts. The other two must be highly specific to the token or crypto trading. Do NOT use generic tags like #Viral.
    5. EXTERNAL LINKS: NEVER include URLs, external links, third-party domains, or ads in the title or description. The only permitted site is tokenradar.co.

    Format your exact output as valid JSON with exactly two keys: "title" and "description". Do not include markdown blocks.
  `;

  const youtubeSchema = {
    type: "object",
    properties: {
      title: { type: "string", description: "Video title under 60 chars." },
      description: { type: "string", description: "Video description with hook, branding, and hashtags." }
    },
    required: ["title", "description"]
  };

  try {
    const result = await callAIWithFallback("", prompt, 500, youtubeSchema);
    return JSON.parse(result.content);
  } catch (_error) {
    console.warn(`  ⚠ AI YouTube metadata generation failed. Using fallbacks.`);
    return {
      title: `${tokenName} ($${symbol.toUpperCase()}) Breakout! 🚀 24h Update`,
      description: `Watch why ${tokenName} is making moves in the market today! Current price sits around ${priceStr} with a ${changeStr} shift in the last 24h.\n\nSubscribe to TokenRadar for daily crypto intel.\n\n#Shorts #CryptoTrading #${symbol.toUpperCase()}`
    };
  }
}
