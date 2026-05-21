import { createHash } from "crypto";
import { sleep, Mutex, ensureHtmlTagsClosed } from "./shared-utils";
import { fetchWithRetry } from "./fetch-with-retry";
import { formatErrorForLog } from "./utils";
import { SOCIAL, SOCIAL_PLATFORM_LIMITS } from "./config";
import { sanitizeSocialEditorialText } from "./social-editorial";
import { sanitizePostTextLinks, sanitizeTelegramPostLinks } from "./social-link-policy";
import {
  formatVariantPromptLine,
  getSocialContentVariant,
  resolveSocialContentVariant,
  type SocialContentVariant,
} from "./social-variety";
import { sanitizeCashtags, truncateForX } from "./x-client";

export type AIResult = {
  content: string;
  promptTokens: number;
  completionTokens: number;
  thoughtsTokens?: number;
  provider: string;
  model: string;
  cost: number;
  finishReason?: string;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
};

export interface PromptCacheOptions {
  namespace?: string;
  cacheableUserPrefix?: string;
  ttlSeconds?: number;
}

export interface AICallOptions {
  promptCache?: PromptCacheOptions;
}

const aiMutex = new Mutex();
let lastGeminiRequestTime = 0;

export const PRIMARY_MODEL = "gemini-2.5-flash";
export const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_OUTPUT_TOKENS = 4000;
const DEFAULT_AI_RETRIES = 3;
const AI_RETRY_DELAY_MS = 2000;
const GEMINI_MIN_REQUEST_INTERVAL_MS = 4100;
const GEMINI_INPUT_COST_PER_MILLION = 0.30;
const GEMINI_CACHED_INPUT_COST_PER_MILLION = 0.03;
const GEMINI_OUTPUT_COST_PER_MILLION = 2.50;
const GEMINI_CACHE_STORAGE_COST_PER_MILLION_TOKEN_HOUR = 1.00;
const CLAUDE_INPUT_COST_PER_MILLION = 0.80;
const CLAUDE_CACHE_WRITE_COST_PER_MILLION = CLAUDE_INPUT_COST_PER_MILLION * 1.25;
const CLAUDE_CACHE_READ_COST_PER_MILLION = CLAUDE_INPUT_COST_PER_MILLION * 0.10;
const CLAUDE_OUTPUT_COST_PER_MILLION = 4.00;
const DEFAULT_GEMINI_THINKING_BUDGET = 0;
const GEMINI_MAX_TOKEN_RETRY_CAP = 8192;
const DEFAULT_PROMPT_CACHE_TTL_SECONDS = 300;
const GEMINI_PROMPT_CACHE_MIN_TOKENS = 1024;
const CLAUDE_HAIKU_4_5_PROMPT_CACHE_MIN_TOKENS = 4096;

interface GeminiPromptCacheEntry {
  name: string;
  createdInputTokens: number;
  expiresAtMs: number;
  storageCostAccounted?: boolean;
}

const geminiPromptCaches = new Map<string, Promise<GeminiPromptCacheEntry | null>>();

function getPromptCacheTtlSeconds(options?: PromptCacheOptions): number {
  const ttl = options?.ttlSeconds ?? DEFAULT_PROMPT_CACHE_TTL_SECONDS;
  return Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : DEFAULT_PROMPT_CACHE_TTL_SECONDS;
}

function isPromptCachingDisabled(): boolean {
  const disabled = process.env.AI_PROMPT_CACHE_DISABLED?.trim().toLowerCase();
  const enabled = process.env.AI_PROMPT_CACHE_ENABLED?.trim().toLowerCase();
  return disabled === "1" || disabled === "true" || enabled === "0" || enabled === "false";
}

function approximateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

function getCacheableUserPrefix(options?: AICallOptions): string | undefined {
  const prefix = options?.promptCache?.cacheableUserPrefix;
  return prefix && prefix.trim() ? prefix : undefined;
}

function buildUserPromptWithCachePrefix(userPrompt: string, options?: AICallOptions): string {
  const prefix = getCacheableUserPrefix(options);
  return prefix ? `${prefix}\n\n${userPrompt}` : userPrompt;
}

function buildLegacyGeminiUserPrompt(systemPrompt: string, userPrompt: string): string {
  return systemPrompt ? `SYSTEM: ${systemPrompt}\n\nUSER: ${userPrompt}` : userPrompt;
}

function buildGeminiContent(text: string): { role: "user"; parts: { text: string }[] } {
  return {
    role: "user",
    parts: [{ text }],
  };
}

function buildGeminiSystemInstruction(systemPrompt: string): { parts: { text: string }[] } | undefined {
  return systemPrompt.trim() ? { parts: [{ text: systemPrompt }] } : undefined;
}

function getGeminiPromptCacheKey(
  model: string,
  systemPrompt: string,
  cacheableUserPrefix: string,
  promptCache?: PromptCacheOptions,
): string {
  const hash = createHash("sha256")
    .update(model)
    .update("\0")
    .update(systemPrompt)
    .update("\0")
    .update(cacheableUserPrefix)
    .digest("hex");
  return `${promptCache?.namespace || "prompt"}:${hash}`;
}

function buildGeminiPromptCacheDisplayName(cacheKey: string): string {
  const [namespace, hash] = cacheKey.split(":");
  return `${namespace || "prompt"}-${hash?.slice(0, 12) || "cache"}`
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 128);
}

function shouldUseGeminiPromptCache(
  systemPrompt: string,
  cacheableUserPrefix: string | undefined,
): cacheableUserPrefix is string {
  if (isPromptCachingDisabled()) return false;
  if (!cacheableUserPrefix) return false;
  return approximateTokenCount(`${systemPrompt}\n${cacheableUserPrefix}`) >= GEMINI_PROMPT_CACHE_MIN_TOKENS;
}

function shouldUseClaudePromptCache(
  model: string,
  systemPrompt: string,
  cacheableUserPrefix: string | undefined,
): cacheableUserPrefix is string {
  if (isPromptCachingDisabled()) return false;
  if (!cacheableUserPrefix) return false;

  const minTokens = model.includes("haiku-4-5")
    ? CLAUDE_HAIKU_4_5_PROMPT_CACHE_MIN_TOKENS
    : 1024;
  return approximateTokenCount(`${systemPrompt}\n${cacheableUserPrefix}`) >= minTokens;
}

async function createGeminiPromptCache(
  apiKey: string,
  model: string,
  systemPrompt: string,
  cacheableUserPrefix: string,
  promptCache?: PromptCacheOptions,
): Promise<GeminiPromptCacheEntry | null> {
  const ttlSeconds = getPromptCacheTtlSeconds(promptCache);
  const cacheKey = getGeminiPromptCacheKey(model, systemPrompt, cacheableUserPrefix, promptCache);
  const url = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`;
  const body: Record<string, unknown> = {
    model: `models/${model}`,
    displayName: buildGeminiPromptCacheDisplayName(cacheKey),
    ttl: `${ttlSeconds}s`,
    contents: [buildGeminiContent(cacheableUserPrefix)],
  };

  const systemInstruction = buildGeminiSystemInstruction(systemPrompt);
  if (systemInstruction) body.systemInstruction = systemInstruction;

  try {
    const response = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      throwOnHttpError: false,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`  [prompt-cache] Gemini cache create skipped: HTTP ${response.status}: ${errorText.substring(0, 240)}`);
      return null;
    }

    const data = await response.json() as {
      name?: string;
      usageMetadata?: {
        totalTokenCount?: number;
      };
    };

    if (!data.name) return null;

    return {
      name: data.name,
      createdInputTokens: data.usageMetadata?.totalTokenCount || approximateTokenCount(`${systemPrompt}\n${cacheableUserPrefix}`),
      expiresAtMs: Date.now() + ttlSeconds * 1000,
    };
  } catch (error) {
    console.warn(`  [prompt-cache] Gemini cache create failed: ${formatErrorForLog(error)}`);
    return null;
  }
}

async function getGeminiPromptCache(
  apiKey: string,
  model: string,
  systemPrompt: string,
  cacheableUserPrefix: string,
  promptCache?: PromptCacheOptions,
): Promise<GeminiPromptCacheEntry | null> {
  const cacheKey = getGeminiPromptCacheKey(model, systemPrompt, cacheableUserPrefix, promptCache);
  const existing = geminiPromptCaches.get(cacheKey);
  if (existing) {
    const entry = await existing;
    if (entry && entry.expiresAtMs - Date.now() > 30_000) return entry;
    geminiPromptCaches.delete(cacheKey);
  }

  const pending = createGeminiPromptCache(apiKey, model, systemPrompt, cacheableUserPrefix, promptCache);
  geminiPromptCaches.set(cacheKey, pending);
  return pending;
}

function calculateGeminiCacheStorageCost(tokens: number, ttlSeconds: number): number {
  return (tokens / 1_000_000) *
    GEMINI_CACHE_STORAGE_COST_PER_MILLION_TOKEN_HOUR *
    (ttlSeconds / 3600);
}

function getGeminiThinkingBudget(): number {
  const rawBudget = process.env.GEMINI_THINKING_BUDGET?.trim();
  if (!rawBudget) return DEFAULT_GEMINI_THINKING_BUDGET;

  const budget = Number(rawBudget);
  if (Number.isInteger(budget) && (budget === -1 || (budget >= 0 && budget <= 24576))) {
    return budget;
  }

  console.warn(
    `  ⚠ Invalid GEMINI_THINKING_BUDGET="${rawBudget}". Using ${DEFAULT_GEMINI_THINKING_BUDGET}.`,
  );
  return DEFAULT_GEMINI_THINKING_BUDGET;
}

function getGeminiThinkingConfig(model: string): { thinkingBudget: number } | undefined {
  return model.includes("2.5") ? { thinkingBudget: getGeminiThinkingBudget() } : undefined;
}

function buildGeminiGenerationConfig(
  model: string,
  maxTokens: number,
  jsonSchema?: object,
): Record<string, unknown> {
  const thinkingConfig = getGeminiThinkingConfig(model);

  return {
    temperature: 0.7,
    maxOutputTokens: maxTokens,
    ...(thinkingConfig ? { thinkingConfig } : {}),
    ...(jsonSchema ? {
      responseMimeType: "application/json",
      responseSchema: jsonSchema,
    } : {}),
  };
}

async function callGeminiAPI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = DEFAULT_MAX_OUTPUT_TOKENS,
  retries: number = DEFAULT_AI_RETRIES,
  jsonSchema?: object,
  options?: AICallOptions,
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

        const cacheableUserPrefix = getCacheableUserPrefix(options);
        const cacheEntry = shouldUseGeminiPromptCache(systemPrompt, cacheableUserPrefix)
          ? await getGeminiPromptCache(apiKey, model, systemPrompt, cacheableUserPrefix, options?.promptCache)
          : null;
        const contents = cacheEntry || cacheableUserPrefix
          ? [
              buildGeminiContent(
                cacheEntry
                  ? userPrompt
                  : buildUserPromptWithCachePrefix(userPrompt, options),
              ),
            ]
          : [
              {
                parts: [{ text: buildLegacyGeminiUserPrompt(systemPrompt, userPrompt) }],
              },
            ];
        const requestBody: Record<string, unknown> = {
          contents,
          generationConfig: buildGeminiGenerationConfig(model, maxTokens, jsonSchema),
        };
        const systemInstruction = buildGeminiSystemInstruction(systemPrompt);
        if (cacheEntry) {
          requestBody.cachedContent = cacheEntry.name;
        } else if (cacheableUserPrefix && systemInstruction) {
          requestBody.systemInstruction = systemInstruction;
        }

        const body = JSON.stringify(requestBody);
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
        const cacheReadTokens = data.usageMetadata?.cachedContentTokenCount || 0;
        const cacheCreationTokens = cacheEntry && !cacheEntry.storageCostAccounted ? cacheEntry.createdInputTokens : 0;
        if (cacheEntry) cacheEntry.storageCostAccounted = true;
        const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
        const thoughtsTokens = data.usageMetadata?.thoughtsTokenCount || 0;
        const finishReason = candidate.finishReason;


        const uncachedPromptTokens = Math.max(0, promptTokens - cacheReadTokens);
        const cost =
          (uncachedPromptTokens / 1_000_000) * GEMINI_INPUT_COST_PER_MILLION +
          (cacheReadTokens / 1_000_000) * GEMINI_CACHED_INPUT_COST_PER_MILLION +
          calculateGeminiCacheStorageCost(cacheCreationTokens, getPromptCacheTtlSeconds(options?.promptCache)) +
          ((completionTokens + thoughtsTokens) / 1_000_000) * GEMINI_OUTPUT_COST_PER_MILLION;

        return {
          content: text.trim(),
          promptTokens,
          completionTokens,
          thoughtsTokens,
          provider: "gemini",
          model,
          cost,
          finishReason,
          cacheCreationTokens: cacheCreationTokens || undefined,
          cacheReadTokens: cacheReadTokens || undefined,
        };
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
  jsonSchema?: object,
  options?: AICallOptions,
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

      const cacheableUserPrefix = getCacheableUserPrefix(options);
      const usePromptCache = shouldUseClaudePromptCache(model, systemPrompt, cacheableUserPrefix);
      const messages = [{
        role: "user",
        content: usePromptCache
          ? [
              {
                type: "text",
                text: cacheableUserPrefix,
                cache_control: { type: "ephemeral" },
              },
              {
                type: "text",
                text: userPrompt,
              },
            ]
          : buildUserPromptWithCachePrefix(userPrompt, options),
      }];

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
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
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

      const uncachedPromptTokens = data.usage?.input_tokens || 0;
      const cacheCreationTokens = data.usage?.cache_creation_input_tokens || 0;
      const cacheReadTokens = data.usage?.cache_read_input_tokens || 0;
      const promptTokens = uncachedPromptTokens + cacheCreationTokens + cacheReadTokens;
      const completionTokens = data.usage?.output_tokens || 0;

      const cost =
        (uncachedPromptTokens / 1_000_000) * CLAUDE_INPUT_COST_PER_MILLION +
        (cacheCreationTokens / 1_000_000) * CLAUDE_CACHE_WRITE_COST_PER_MILLION +
        (cacheReadTokens / 1_000_000) * CLAUDE_CACHE_READ_COST_PER_MILLION +
        (completionTokens / 1_000_000) * CLAUDE_OUTPUT_COST_PER_MILLION;

      return {
        content: text.trim(),
        promptTokens,
        completionTokens,
        provider: "claude",
        model,
        cost,
        finishReason: "STOP",
        cacheCreationTokens: cacheCreationTokens || undefined,
        cacheReadTokens: cacheReadTokens || undefined,
      };
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

function formatGeminiFinishReason(result: AIResult): string {
  const tokenInfo = result.thoughtsTokens
    ? `, thoughts tokens: ${result.thoughtsTokens}, visible output tokens: ${result.completionTokens}`
    : `, visible output tokens: ${result.completionTokens}`;
  return `${result.finishReason}${tokenInfo}`;
}

function nextGeminiMaxTokens(maxTokens: number): number | null {
  if (maxTokens >= GEMINI_MAX_TOKEN_RETRY_CAP) return null;
  return Math.min(GEMINI_MAX_TOKEN_RETRY_CAP, Math.max(maxTokens * 2, maxTokens + 512));
}

export async function callAIWithFallback(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = DEFAULT_MAX_OUTPUT_TOKENS,
  jsonSchema?: object,
  options?: AICallOptions,
): Promise<AIResult> {
  try {
    // Try Gemini first (primary — lower cost)
    let result = await callGeminiAPI(systemPrompt, userPrompt, maxTokens, DEFAULT_AI_RETRIES, jsonSchema, options);
    if (isTechnicalRefusal(result.content)) {
      console.warn(`  ⚠ Gemini returned a technical refusal. Falling back to Claude...`);
      throw new Error("AI Technical Refusal");
    }
    if (result.finishReason && result.finishReason !== "STOP") {
      const retryMaxTokens = result.finishReason === "MAX_TOKENS" ? nextGeminiMaxTokens(maxTokens) : null;
      if (retryMaxTokens) {
        console.warn(
          `  ⚠ Gemini finished with reason: ${formatGeminiFinishReason(result)}. Retrying with ${retryMaxTokens} max output tokens...`,
        );
        result = await callGeminiAPI(systemPrompt, userPrompt, retryMaxTokens, 1, jsonSchema, options);
        if (!isTechnicalRefusal(result.content) && (!result.finishReason || result.finishReason === "STOP")) {
          return result;
        }
      }
    }
    if (isTechnicalRefusal(result.content)) {
      console.warn(`  ⚠ Gemini returned a technical refusal. Falling back to Claude...`);
      throw new Error("AI Technical Refusal");
    }
    if (result.finishReason && result.finishReason !== "STOP") {
      console.warn(`  ⚠ Gemini finished with reason: ${formatGeminiFinishReason(result)}. Output snippet: ${result.content.substring(0, 150)}...`);
      throw new Error(`AI Truncated: ${result.finishReason}`);
    }
    return result;
  } catch (error) {
    console.warn(`  ⚠ Gemini primary failed or refused. Falling back to Claude... Gemini error: ${formatErrorForLog(error)}`);
    const result = await callClaudeAPI(systemPrompt, userPrompt, maxTokens, DEFAULT_AI_RETRIES, jsonSchema, options);
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

export interface UnifiedSocialCaptions {
  telegramSummary?: string;
  xTweet?: string;
  youtubeTitle?: string;
  youtubeDescription?: string;
  instagramCaption?: string;
  threadsCaption?: string;
  threadsTopicTag?: string;
  threadsSpoilerText?: string;
  tiktokCaption?: string;
}

export type PlatformTarget = "telegram" | "x" | "youtube" | "instagram" | "threads" | "tiktok";

export interface UnifiedCaptionOptions {
  telegramMaxChars?: number;
  xMaxChars?: number;
  instagramMaxChars?: number;
  threadsMaxChars?: number;
  tiktokMaxChars?: number;
  youtubeTitleMaxChars?: number;
  editorialFormat?: {
    label: string;
    angle: string;
    promptInstruction: string;
    captionInstruction?: string;
  };
  contentVariants?: Partial<Record<PlatformTarget, SocialContentVariant | string>>;
}

type UnifiedCaptionField = keyof UnifiedSocialCaptions;

const PLATFORM_FIELDS: Record<PlatformTarget, UnifiedCaptionField[]> = {
  telegram: ["telegramSummary"],
  x: ["xTweet"],
  youtube: ["youtubeTitle", "youtubeDescription"],
  instagram: ["instagramCaption"],
  threads: ["threadsCaption", "threadsTopicTag", "threadsSpoilerText"],
  tiktok: ["tiktokCaption"],
};

const UNIFIED_FIELD_DESCRIPTIONS: Record<UnifiedCaptionField, string> = {
  telegramSummary: "Telegram HTML summary using only supported tags such as <b> and <tg-spoiler>.",
  xTweet: "Short X post text.",
  youtubeTitle: "YouTube Shorts title.",
  youtubeDescription: "YouTube Shorts description.",
  instagramCaption: "Instagram Reel caption with hashtags embedded at the end.",
  threadsCaption: "Threads caption text. Must include the spoiler text exactly once.",
  threadsTopicTag: "Single-word Threads topic tag without #, dots, ampersands, or spaces.",
  threadsSpoilerText: "Exact substring in threadsCaption that should become a Threads spoiler entity.",
  tiktokCaption: "TikTok video caption with hashtags and optional @tokenradarco mention.",
};

function formatSocialPrice(price: number | undefined): string {
  if (price === undefined) return "N/A";
  return price >= 1 ? `$${price.toFixed(2)}` : `$${price.toFixed(6)}`;
}

function formatSocialChange(change: number | undefined): string {
  if (change === undefined) return "N/A";
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}

function formatSocialMarketCap(marketCap: number | undefined): string {
  if (marketCap === undefined) return "N/A";
  return marketCap >= 1e9
    ? `$${(marketCap / 1e9).toFixed(2)}B`
    : `$${(marketCap / 1e6).toFixed(0)}M`;
}

function buildUnifiedCaptionSchema(platforms: PlatformTarget[]): object {
  const properties: Record<string, object> = {};
  const required: string[] = [];

  for (const platform of platforms) {
    for (const field of PLATFORM_FIELDS[platform]) {
      properties[field] = {
        type: "string",
        description: UNIFIED_FIELD_DESCRIPTIONS[field],
      };
      required.push(field);
    }
  }

  return {
    type: "object",
    properties,
    required,
  };
}

function getUnifiedCaptionMaxTokens(platforms: PlatformTarget[]): number {
  return platforms.length > 0 ? DEFAULT_MAX_OUTPUT_TOKENS : 0;
}

function stripJsonFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function readStringField(payload: unknown, field: UnifiedCaptionField): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Partial<Record<UnifiedCaptionField, unknown>>)[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sanitizeUnifiedTopicTag(topicTag: string | undefined): string {
  let sanitized = (topicTag || "crypto")
    .replace(/[#.&]/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!sanitized) sanitized = "crypto";
  if (sanitized.length > SOCIAL_PLATFORM_LIMITS.THREADS.TOPIC_TAG_MAX_LENGTH) {
    sanitized = sanitized.substring(0, SOCIAL_PLATFORM_LIMITS.THREADS.TOPIC_TAG_MAX_LENGTH);
  }

  return sanitized;
}

function fallbackInstagramCaption(tokenName: string, symbol: string, metrics: MarketContext): string {
  const change = formatSocialChange(metrics.priceChange24h);
  const price = formatSocialPrice(metrics.price);
  const marketCap = formatSocialMarketCap(metrics.marketCap);

  return [
    `Market spotlight: ${tokenName} is moving ${change}.`,
    `Price: ${price}. Market cap: ${marketCap}.`,
    "Follow @tokenradarco for daily crypto data.",
    `#${symbol.toUpperCase()} #Crypto #Altcoins #TokenRadar #CryptoMarket`,
  ].join("\n\n");
}

function fallbackThreadsCaption(tokenName: string, metrics: MarketContext): string {
  const change = formatSocialChange(metrics.priceChange24h);
  return `This setup is moving ${change}. Watch the data behind ${tokenName}.`;
}

function fallbackTikTokCaption(tokenName: string, symbol: string, metrics: MarketContext): string {
  const change = formatSocialChange(metrics.priceChange24h);
  const price = formatSocialPrice(metrics.price);
  const marketCap = formatSocialMarketCap(metrics.marketCap);

  return [
    `${tokenName} crypto market update`,
    `${change} in 24h | Price: ${price} | Market cap: ${marketCap}`,
    "Watch liquidity and follow-through before treating this as a valid market read.",
    `@tokenradarco #${symbol.toUpperCase()} #Crypto #TokenRadar #Altcoins`,
  ].join("\n\n");
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.substring(0, maxChars);
  return `${text.substring(0, maxChars - 3).trim()}...`;
}

const TIKTOK_GENERIC_HASHTAGS = new Set([
  "#fyp",
  "#foryou",
  "#foryoupage",
  "#viral",
  "#trending",
  "#explore",
  "#xyzbca",
]);

function normalizeHashtag(tag: string): string {
  return tag.replace(/[^#a-zA-Z0-9_]/g, "").trim();
}

function symbolToHashtag(symbol: string): string | undefined {
  const cleaned = symbol.replace(/[^a-zA-Z0-9_]/g, "").toUpperCase();
  return cleaned ? `#${cleaned}` : undefined;
}

function compactTikTokBody(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function prepareTikTokCaptionForPublishing(
  caption: string,
  symbol: string,
  maxChars: number = SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT,
): string {
  const cleaned = compactTikTokBody(sanitizeSocialEditorialText(sanitizePostTextLinks(caption)));
  const rawTags = cleaned.match(/#[a-zA-Z0-9_]+/g) || [];
  const body = compactTikTokBody(cleaned.replace(/#[a-zA-Z0-9_]+/g, ""));

  const requiredTags = [
    symbolToHashtag(symbol),
    "#Crypto",
    "#TokenRadar",
  ].filter((tag): tag is string => Boolean(tag));

  const candidateTags = [...requiredTags, ...rawTags]
    .map(normalizeHashtag)
    .filter(Boolean)
    .filter((tag) => !TIKTOK_GENERIC_HASHTAGS.has(tag.toLowerCase()));

  const seen = new Set<string>();
  const tags = candidateTags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);

  const hashtagLine = tags.join(" ");
  const bodyBudget = maxChars - (hashtagLine ? hashtagLine.length + 2 : 0);
  const safeBody = bodyBudget > 0 ? truncateText(body || "TokenRadar market update.", bodyBudget) : "";

  return compactTikTokBody([safeBody, hashtagLine].filter(Boolean).join("\n\n"));
}

function truncateTextAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  let candidate = text.substring(0, maxChars).trim();
  const lastLt = candidate.lastIndexOf("<");
  const lastGt = candidate.lastIndexOf(">");
  if (lastLt > lastGt) {
    candidate = candidate.substring(0, lastLt).trim();
  }

  const minBoundary = Math.floor(maxChars * 0.55);
  const sentenceBoundaries = [". ", ".\n", "! ", "!\n", "? ", "?\n"];
  let boundary = -1;

  for (const ending of sentenceBoundaries) {
    const index = candidate.lastIndexOf(ending);
    if (index > boundary && index >= minBoundary) boundary = index;
  }

  if (boundary !== -1) return candidate.substring(0, boundary + 1).trim();

  const wordBoundary = candidate.lastIndexOf(" ");
  return wordBoundary >= minBoundary ? candidate.substring(0, wordBoundary).trim() : candidate;
}

function fallbackTelegramSummary(
  tokenName: string,
  symbol: string,
  metrics: MarketContext,
  maxChars: number,
): string {
  const summary = [
    `<b>Radar Read: $${symbol.toUpperCase()} (${tokenName})</b>`,
    `Setup: ${formatSocialChange(metrics.priceChange24h)} over 24h, price <b>${formatSocialPrice(metrics.price)}</b>, market cap <b>${formatSocialMarketCap(metrics.marketCap)}</b>.`,
    `Why it matters: selection reason is ${metrics.selectionReason || "market spotlight"} with risk score <b>${metrics.riskScore ?? "N/A"}/10</b>.`,
    `Risk / invalidation: skip blind entries; wait for liquidity and trend confirmation.`,
    `<tg-spoiler>TokenRadar read: data is interesting, but this is watchlist research, not a trade command.</tg-spoiler>`,
  ].join("\n");

  return ensureHtmlTagsClosed(truncateTextAtBoundary(summary, maxChars), ["b", "tg-spoiler"]);
}

function fallbackXTweet(
  tokenName: string,
  symbol: string,
  metrics: MarketContext,
  maxChars: number,
): string {
  const price = formatSocialPrice(metrics.price).replace(/^\$/, "");
  const marketCap = formatSocialMarketCap(metrics.marketCap).replace(/^\$/, "");
  const tweet = `$${symbol.toUpperCase()} ${tokenName}: ${formatSocialChange(metrics.priceChange24h)} over 24h, price ${price}, market cap ${marketCap}. Does the data support more upside from here? #Crypto`;
  return truncateForX(tweet, maxChars);
}

function fallbackYoutubeMetadata(
  tokenName: string,
  symbol: string,
  metrics: MarketContext,
): { title: string; description: string } {
  const title = truncateText(`${tokenName} ($${symbol.toUpperCase()}) 24h Market Update`, 60);
  const description = `${tokenName} is moving ${formatSocialChange(metrics.priceChange24h)} over 24h, with price near ${formatSocialPrice(metrics.price)} and market cap around ${formatSocialMarketCap(metrics.marketCap)}.\nFull data report & analytics: ${SOCIAL.ecosystemUrl}\n#Shorts #${symbol.toUpperCase()} #Crypto`;
  return { title, description };
}

function enforceUnifiedCaptionLimits(
  captions: UnifiedSocialCaptions,
  options: UnifiedCaptionOptions,
  symbol: string,
): UnifiedSocialCaptions {
  const next: UnifiedSocialCaptions = { ...captions };

  if (next.telegramSummary) {
    next.telegramSummary = sanitizeSocialEditorialText(sanitizeTelegramPostLinks(next.telegramSummary));
  }
  if (next.telegramSummary && options.telegramMaxChars) {
    next.telegramSummary = ensureHtmlTagsClosed(
      truncateTextAtBoundary(next.telegramSummary, options.telegramMaxChars),
      ["b", "tg-spoiler"],
    );
  }
  if (next.xTweet) {
    next.xTweet = sanitizeSocialEditorialText(sanitizePostTextLinks(next.xTweet));
    next.xTweet = sanitizeCashtags(next.xTweet);
    next.xTweet = truncateForX(next.xTweet, options.xMaxChars ?? SOCIAL_PLATFORM_LIMITS.X.CHAR_LIMIT);
  }
  if (next.youtubeDescription) {
    next.youtubeDescription = sanitizeSocialEditorialText(sanitizePostTextLinks(next.youtubeDescription));
  }
  if (next.youtubeTitle) {
    next.youtubeTitle = sanitizeSocialEditorialText(sanitizePostTextLinks(next.youtubeTitle));
    next.youtubeTitle = truncateText(next.youtubeTitle, options.youtubeTitleMaxChars ?? 60);
  }
  if (next.instagramCaption) {
    next.instagramCaption = sanitizeSocialEditorialText(sanitizePostTextLinks(next.instagramCaption));
    next.instagramCaption = truncateText(
      next.instagramCaption,
      options.instagramMaxChars ?? SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT,
    );
  }
  if (next.threadsCaption) {
    next.threadsCaption = sanitizeSocialEditorialText(sanitizePostTextLinks(next.threadsCaption));
    next.threadsCaption = truncateText(
      next.threadsCaption,
      options.threadsMaxChars ?? SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT,
    );
  }
  if (next.tiktokCaption) {
    next.tiktokCaption = prepareTikTokCaptionForPublishing(
      next.tiktokCaption,
      symbol,
      options.tiktokMaxChars ?? SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT,
    );
  }

  return next;
}

async function fillMissingUnifiedCaptionFields(
  captions: UnifiedSocialCaptions,
  tokenName: string,
  symbol: string,
  metrics: MarketContext,
  platforms: PlatformTarget[],
  options: UnifiedCaptionOptions
): Promise<UnifiedSocialCaptions> {
  const next: UnifiedSocialCaptions = { ...captions };

  if (platforms.includes("telegram") && !next.telegramSummary) {
    next.telegramSummary = fallbackTelegramSummary(
      tokenName,
      symbol,
      metrics,
      options.telegramMaxChars ?? SOCIAL_PLATFORM_LIMITS.TELEGRAM.AI_SUMMARY_CHARS,
    );
  }

  if (platforms.includes("x") && !next.xTweet) {
    next.xTweet = fallbackXTweet(
      tokenName,
      symbol,
      metrics,
      options.xMaxChars ?? SOCIAL_PLATFORM_LIMITS.X.CHAR_LIMIT,
    );
  }

  if (platforms.includes("youtube") && (!next.youtubeTitle || !next.youtubeDescription)) {
    const youtubeMetadata = fallbackYoutubeMetadata(tokenName, symbol, metrics);
    next.youtubeTitle ||= youtubeMetadata.title;
    next.youtubeDescription ||= youtubeMetadata.description;
  }

  if (platforms.includes("instagram") && !next.instagramCaption) {
    next.instagramCaption = fallbackInstagramCaption(tokenName, symbol, metrics);
  }

  if (platforms.includes("threads")) {
    next.threadsCaption ||= fallbackThreadsCaption(tokenName, metrics);
    next.threadsTopicTag = sanitizeUnifiedTopicTag(next.threadsTopicTag);
    next.threadsSpoilerText ||= tokenName;
  }

  if (platforms.includes("tiktok") && !next.tiktokCaption) {
    next.tiktokCaption = fallbackTikTokCaption(tokenName, symbol, metrics);
  }

  return enforceUnifiedCaptionLimits(next, options, symbol);
}

/**
 * Generate publish-time captions for the requested social platforms with one
 * structured AI call. Video hook text intentionally stays separate because it
 * is a render-time input and must be available before Remotion renders.
 */
export async function generateUnifiedCaptions(
  tokenName: string,
  symbol: string,
  description: string,
  metrics: MarketContext,
  platforms: PlatformTarget[],
  options: UnifiedCaptionOptions = {},
): Promise<UnifiedSocialCaptions> {
  const uniquePlatforms = Array.from(new Set(platforms));
  if (uniquePlatforms.length === 0) return {};

  const platformVariants = uniquePlatforms.reduce((acc, platform) => {
    const configuredVariant = options.contentVariants?.[platform];
    acc[platform] = configuredVariant
      ? resolveSocialContentVariant(platform, configuredVariant)
      : getSocialContentVariant(platform, [
          symbol,
          tokenName,
          metrics.selectionReason,
          metrics.timeOfDay,
        ]);
    return acc;
  }, {} as Partial<Record<PlatformTarget, SocialContentVariant>>);

  const contentVariantBrief = uniquePlatforms
    .map((platform) => formatVariantPromptLine(platform, platformVariants[platform]!))
    .join("\n");
  const editorialFormatBrief = options.editorialFormat
    ? [
        `Format: ${options.editorialFormat.label}`,
        `Angle: ${options.editorialFormat.angle}`,
        `Format instruction: ${options.editorialFormat.promptInstruction}`,
        options.editorialFormat.captionInstruction
          ? `Caption instruction: ${options.editorialFormat.captionInstruction}`
          : "",
      ].filter(Boolean).join("\n")
    : "No extra editorial format.";

  const platformRuleBlocks: Partial<Record<PlatformTarget, string>> = {
    telegram: `
TELEGRAM RULES:
- Return "telegramSummary" only for Telegram.
- Maximum ${options.telegramMaxChars ?? SOCIAL_PLATFORM_LIMITS.TELEGRAM.AI_SUMMARY_CHARS} characters.
- Write like a premium crypto research desk read, not a generic social update.
- Today's Telegram angle: ${platformVariants.telegram?.label} - ${platformVariants.telegram?.angle}.
- Use this exact compact structure:
  <b>Radar Read: $${symbol.toUpperCase()} (${tokenName})</b>
  Setup: [one concise setup line using concrete market data]
  Why it matters: [one concise catalyst/context line]
  Risk / invalidation: [one concise condition that would weaken the setup]
  <tg-spoiler>TokenRadar read: [one balanced verdict]</tg-spoiler>
- Use <b> tags only for specific numbers and key metrics.
- Do not say buy, sell, long, short, signal, entry, take-profit, guaranteed, or financial advice.
- No URLs, external links, markdown, numbered lists, or unsupported HTML tags.`,
    x: `
X RULES:
- Return "xTweet" only for X.
- Maximum ${options.xMaxChars ?? SOCIAL_PLATFORM_LIMITS.X.CHAR_LIMIT} characters.
- Today's X angle: ${platformVariants.x?.label} - ${platformVariants.x?.angle}.
- Use exactly one cashtag: $${symbol.toUpperCase()}.
- Write prices as plain numbers, not dollar-prefixed prices.
- End with a strong, data-driven question.
- Include exactly 1 or 2 niche hashtags.
- No URLs, external links, HTML, markdown, or AI disclaimers.`,
    youtube: `
YOUTUBE RULES:
- Return "youtubeTitle" and "youtubeDescription".
- Title must be under ${options.youtubeTitleMaxChars ?? 60} characters and front-load ${tokenName} or $${symbol.toUpperCase()}.
- Today's YouTube angle: ${platformVariants.youtube?.label} - ${platformVariants.youtube?.angle}.
- Description must open with a 1-2 sentence hook, then include this exact allowed site line: "Full data report & analytics: ${SOCIAL.ecosystemUrl}".
- End the description with exactly 3 hashtags. The first must be #Shorts.
- No external links except the TokenRadar site URL.`,
    instagram: `
INSTAGRAM RULES:
- Return "instagramCaption" only for Instagram.
- Maximum ${options.instagramMaxChars ?? SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT} characters.
- Today's Instagram angle: ${platformVariants.instagram?.label} - ${platformVariants.instagram?.angle}.
- Start with a platform-native hook that matches today's angle, then include 2-3 market data points naturally.
- Mention @tokenradarco once.
- Include 8-12 relevant hashtags at the end.
- Use emojis sparingly and do not use rocket emojis.`,
    threads: `
THREADS RULES:
- Return "threadsCaption", "threadsTopicTag", and "threadsSpoilerText".
- Maximum ${options.threadsMaxChars ?? SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT} characters for threadsCaption.
- Today's Threads angle: ${platformVariants.threads?.label} - ${platformVariants.threads?.angle}.
- threadsSpoilerText must be an exact substring of threadsCaption and should usually be "${tokenName}".
- Build curiosity around the spoiler text without using marker syntax.
- threadsTopicTag must be one single word, 1-50 characters, without #, dots, ampersands, or spaces.
- Do not mention @tokenradarco.`,
    tiktok: `
TIKTOK RULES:
- Return "tiktokCaption" only for TikTok.
- Maximum ${options.tiktokMaxChars ?? SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT} characters.
- Today's TikTok angle: ${platformVariants.tiktok?.label} - ${platformVariants.tiktok?.angle}.
- Treat tiktokCaption as the TikTok video description/caption.
- Aim for 140-300 characters even though the hard platform cap is higher.
- Use this search-first structure:
  Line 1: a short hook under 80 characters that includes ${tokenName} or $${symbol.toUpperCase()} plus a searchable phrase like "crypto market update", "altcoin watchlist", or the token's narrative.
  Line 2: 2-3 concrete market data points, written naturally.
  Line 3: one risk or confirmation filter. Do not give trading advice.
  Final line: @tokenradarco plus hashtags.
- Mention @tokenradarco once.
- End with exactly 3-5 relevant hashtags. Use a focused mix of token, narrative/category, crypto, and TokenRadar tags.
- Do not use generic reach tags such as #FYP, #ForYou, #ForYouPage, #viral, or #trending.
- Do not say buy, sell, long, short, signal, entry, take-profit, guaranteed, financial advice, or price prediction.
- No URLs, markdown, HTML, unsupported symbols, AI disclaimers, or rocket emojis.`,
  };

  const priceStr = formatSocialPrice(metrics.price);
  const changeStr = formatSocialChange(metrics.priceChange24h);
  const marketCapStr = formatSocialMarketCap(metrics.marketCap);
  const riskGauge = getRiskGauge(metrics.riskScore);
  const socialContextSection = metrics.socialContext
    ? `\nREAL-TIME SOCIAL BUZZ:\n${metrics.socialContext.substring(0, 1000)}\n`
    : "";
  const descriptionSection = description
    ? description.substring(0, 1500)
    : `${tokenName} is a cryptocurrency token tracked under the symbol ${symbol.toUpperCase()}.`;

  const prompt = `
You are an expert crypto social media manager for TokenRadar.co.
Generate tailored publish-time copy for the requested platforms in one pass.
Return only a valid JSON object matching the requested schema.
Do not include fields for platforms that were not requested.
Never include external links. The only allowed post URL is ${SOCIAL.ecosystemUrl} or another tokenradar.co URL.

REQUESTED PLATFORMS: ${uniquePlatforms.join(", ")}
PERSONA/TONE: ${metrics.tone || "Data-driven research platform"}

CONTENT VARIETY BRIEF:
${contentVariantBrief}

EDITORIAL FORMAT BRIEF:
${editorialFormatBrief}

MARKET DATA:
Token: ${tokenName} (${symbol.toUpperCase()})
Price: ${priceStr}
24h Change: ${changeStr}
Market Cap: ${marketCapStr} (Rank: #${metrics.marketCapRank ?? "N/A"})
Risk Profile: ${riskGauge} (Score: ${metrics.riskScore ?? "N/A"}/10)
Growth Index: ${metrics.growthPotentialIndex ?? "N/A"}/100
Selection Reason: ${metrics.selectionReason || "market spotlight"}
Trending Context: ${metrics.trendingContext || "N/A"}
Global Market: ${metrics.globalStats || "N/A"}
Sector Performance: ${metrics.sectorPerformance || "N/A"}
Community: ${metrics.twitterFollowers ? `${metrics.twitterFollowers.toLocaleString()} Twitter followers` : "N/A"}${metrics.redditSubscribers ? `, ${metrics.redditSubscribers.toLocaleString()} Reddit subscribers` : ""}
Developer: ${metrics.githubCommits4Weeks ? `${metrics.githubCommits4Weeks} GitHub commits in 4 weeks` : "No recent activity"}
${socialContextSection}
BACKGROUND CONTEXT:
${descriptionSection}

STRICT PLATFORM RULES:
${uniquePlatforms.map((platform) => platformRuleBlocks[platform]).join("\n")}
`;

  try {
    const result = await callAIWithFallback(
      "",
      prompt,
      getUnifiedCaptionMaxTokens(uniquePlatforms),
      buildUnifiedCaptionSchema(uniquePlatforms),
    );
    const payload = JSON.parse(stripJsonFence(result.content));
    const captions: UnifiedSocialCaptions = {};

    for (const platform of uniquePlatforms) {
      for (const field of PLATFORM_FIELDS[platform]) {
        const value = readStringField(payload, field);
        if (value) captions[field] = value;
      }
    }

    if (captions.telegramSummary) {
      captions.telegramSummary = ensureHtmlTagsClosed(captions.telegramSummary, ["b", "tg-spoiler"]);
    }
    if (captions.threadsTopicTag) {
      captions.threadsTopicTag = sanitizeUnifiedTopicTag(captions.threadsTopicTag);
    }

    return fillMissingUnifiedCaptionFields(
      captions,
      tokenName,
      symbol,
      metrics,
      uniquePlatforms,
      options,
    );
  } catch (error) {
    console.warn(`  Failed to generate unified captions for ${tokenName}. Falling back per platform: ${formatErrorForLog(error)}`);
    return fillMissingUnifiedCaptionFields(
      {},
      tokenName,
      symbol,
      metrics,
      uniquePlatforms,
      options,
    );
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
    7. Avoid buy/sell advice, hype, moon language, guaranteed outcomes, and urgency.
  `;

  try {
    const result = await callAIWithFallback("", prompt, 512);
    return sanitizeSocialEditorialText(sanitizePostTextLinks(result.content || ""));
  } catch (_error) {
    console.warn(`  ⚠ AI poll hook generation failed.`);
    // Fallback template
    return symbol
      ? `How are you reading ${symbol.toUpperCase()} today?`
      : `Which crypto narrative deserves more research this week?`;
  }
}

