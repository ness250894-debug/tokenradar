import { createHash } from "crypto";
import { sleep, Mutex, ensureHtmlTagsClosed } from "./shared-utils";
import { fetchWithRetry } from "./fetch-with-retry";
import { formatErrorForLog } from "./utils";
import { SOCIAL, SOCIAL_PLATFORM_LIMITS } from "./config";
import {
  sanitizeSocialEditorialText,
  type SocialEditorialOptions,
} from "./social-editorial";
import {
  formatMarketDataAttribution,
  validateSocialContent,
  type SocialContentFacts,
  type SocialContentValidationIssue,
} from "./social-content-validator";
import { persistNeedsReviewRecord } from "./social-review-queue";
import { sanitizePostTextLinks, sanitizeTelegramPostLinks } from "./social-link-policy";
import {
  formatVariantPromptLine,
  getSocialContentVariant,
  resolveSocialContentVariant,
  type SocialContentVariant,
} from "./social-variety";
import {
  formatArchetypePromptLine,
  resolveSocialArchetype,
  selectSocialArchetype,
  type SocialContentArchetype,
} from "./social-archetypes";
import { sanitizeCashtags } from "./x-client";

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
  /** Attach usage accounting to every completed provider response for this call. */
  usageActivity?: {
    workflow?: string;
    contentKey?: string;
    operation?: string;
    attempt?: number;
  };
}

const aiMutex = new Mutex();
let lastGeminiRequestTime = 0;

export const PRIMARY_MODEL = "gemini-3.5-flash-lite";
export const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_OUTPUT_TOKENS = 4000;
const DEFAULT_AI_RETRIES = 3;
const AI_RETRY_DELAY_MS = 2000;
const GEMINI_MIN_REQUEST_INTERVAL_MS = 4100;
const GEMINI_INPUT_COST_PER_MILLION = 0.30;
const GEMINI_CACHED_INPUT_COST_PER_MILLION = 0.03;
const GEMINI_OUTPUT_COST_PER_MILLION = 2.50;
const GEMINI_CACHE_STORAGE_COST_PER_MILLION_TOKEN_HOUR = 1.00;
export const CLAUDE_HAIKU_4_5_PRICING = Object.freeze({
  inputPerMillion: 1.00,
  cacheWritePerMillion: 1.25,
  cacheReadPerMillion: 0.10,
  outputPerMillion: 5.00,
});
const CLAUDE_INPUT_COST_PER_MILLION = CLAUDE_HAIKU_4_5_PRICING.inputPerMillion;
const CLAUDE_CACHE_WRITE_COST_PER_MILLION = CLAUDE_HAIKU_4_5_PRICING.cacheWritePerMillion;
const CLAUDE_CACHE_READ_COST_PER_MILLION = CLAUDE_HAIKU_4_5_PRICING.cacheReadPerMillion;
const CLAUDE_OUTPUT_COST_PER_MILLION = CLAUDE_HAIKU_4_5_PRICING.outputPerMillion;
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
const geminiPromptCacheUnavailableModels = new Set<string>();

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
  model: string,
  systemPrompt: string,
  cacheableUserPrefix: string | undefined,
): cacheableUserPrefix is string {
  if (isPromptCachingDisabled()) return false;
  if (geminiPromptCacheUnavailableModels.has(model)) return false;
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
      retries: 1,
      throwOnHttpError: false,
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (
        response.status === 429 &&
        errorText.includes("TotalCachedContentStorageTokensPerModelFreeTier") &&
        errorText.includes("limit=0")
      ) {
        geminiPromptCacheUnavailableModels.add(model);
      }
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
    ...(model.startsWith("gemini-2.5") ? { temperature: 0.7 } : {}),
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
        const cacheEntry = shouldUseGeminiPromptCache(model, systemPrompt, cacheableUserPrefix)
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

      await logAiUsage(result, options);
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

      const result: AIResult = {
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
      await logAiUsage(result, options);
      return result;
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
  volume24h?: number;
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
  githubCommits4Weeks?: number | null;
  /** Provider/source for the public market snapshot, for example `coingecko-live`. */
  marketDataSource?: string;
  /** ISO timestamp (or display-ready UTC timestamp) for the public market snapshot. */
  marketDataAsOf?: string;
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
  contentArchetypes?: Partial<Record<PlatformTarget, SocialContentArchetype | string>>;
  /** Number of clean regeneration attempts after the first candidate fails validation. */
  validationRegenerationAttempts?: number;
  /** Optional audit hook. Rejected AI output itself is intentionally not exposed. */
  onValidationFailure?: (event: SocialCaptionValidationFailure) => void;
  /** Override used by tests or self-hosted runners; defaults to the cached social-state tree. */
  reviewQueueRootDir?: string;
}

async function logAiUsage(result: AIResult, options?: AICallOptions): Promise<void> {
  const activity = options?.usageActivity;
  if (!activity) return;
  try {
    const { recordAiUsageEvent } = await import("./ops-ledger");
    await recordAiUsageEvent({
      workflow: activity.workflow || process.env.SOCIAL_SLOT || process.env.GITHUB_WORKFLOW || "social",
      contentKey: activity.contentKey,
      operation: activity.operation,
      attempt: activity.attempt,
      provider: result.provider,
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      thoughtsTokens: result.thoughtsTokens,
      cacheCreationTokens: result.cacheCreationTokens,
      cacheReadTokens: result.cacheReadTokens,
      cost: result.cost,
      details: { finishReason: result.finishReason || null },
    });
  } catch (error) {
    console.warn(`  AI usage accounting failed: ${formatErrorForLog(error)}`);
  }
}

export interface SocialCaptionValidationFailure {
  tokenName: string;
  symbol: string;
  attempt: number;
  platforms: PlatformTarget[];
  fields: Array<{
    field: UnifiedCaptionField;
    issues: SocialContentValidationIssue[];
  }>;
}

export type UnifiedCaptionField = keyof UnifiedSocialCaptions;

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

function editorialOptionsForToken(
  tokenName: string,
  symbol: string,
  unsafeBehavior: SocialEditorialOptions["unsafeBehavior"] = "preserve",
): SocialEditorialOptions {
  return {
    unsafeBehavior,
    protectedEntities: [
      ...(tokenName.trim()
        ? [{ value: tokenName, caseSensitive: !/[\s.-]/.test(tokenName) }]
        : []),
      { value: `$${symbol.toUpperCase()}`, caseSensitive: false },
      { value: symbol.toUpperCase(), caseSensitive: true },
    ],
  };
}

export function buildSocialContentFacts(
  tokenName: string,
  symbol: string,
  metrics: MarketContext,
): SocialContentFacts {
  const identityText = `${tokenName} ${symbol}`;
  if (tokenName.length < 1 || tokenName.length > 80
    || !/^[\p{L}\p{N}][\p{L}\p{N} .,'’()&+/_-]*$/u.test(tokenName)
    || symbol.length < 1 || symbol.length > 15
    || !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(symbol)
    || /\b(?:ignore|disregard|override)\b.{0,40}\b(?:instructions?|prompt|system|developer)\b/i.test(identityText)) {
    throw new Error("Token identity is not safe for publish-time social generation.");
  }
  return {
    tokenName,
    symbol,
    price: metrics.price,
    priceChange24h: metrics.priceChange24h,
    marketCap: metrics.marketCap,
    marketCapRank: metrics.marketCapRank,
    volume24h: metrics.volume24h,
    riskScore: metrics.riskScore,
    growthPotentialIndex: metrics.growthPotentialIndex,
    twitterFollowers: metrics.twitterFollowers,
    redditSubscribers: metrics.redditSubscribers,
    githubCommits4Weeks: metrics.githubCommits4Weeks,
    marketDataSource: metrics.marketDataSource,
    marketDataAsOf: metrics.marketDataAsOf,
    suppliedContext: [],
  };
}

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

function formatOptionalScore(score: number | undefined, maximum: number): string {
  return typeof score === "number" && Number.isFinite(score)
    ? `${score}/${maximum}`
    : "N/A";
}

function marketDataAttribution(metrics: MarketContext): string | undefined {
  return formatMarketDataAttribution({
    marketDataSource: metrics.marketDataSource,
    marketDataAsOf: metrics.marketDataAsOf,
  });
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
    `${tokenName} moved ${change}, but the candle is only the first filter.`,
    `Price: ${price}. Reported market cap: ${marketCap}. Recheck the same fields after the next daily close before calling the move durable.`,
    marketDataAttribution(metrics),
    "Save the snapshot for the follow-up. @tokenradarco",
    `#${symbol.toUpperCase()} #CryptoResearch #MarketStructure #RiskManagement #TokenRadar`,
  ].filter(Boolean).join("\n\n");
}

function fallbackThreadsCaption(tokenName: string, metrics: MarketContext): string {
  const change = formatSocialChange(metrics.priceChange24h);
  const turnover = typeof metrics.volume24h === "number" && Number.isFinite(metrics.volume24h)
    && typeof metrics.marketCap === "number" && Number.isFinite(metrics.marketCap) && metrics.marketCap > 0
    ? ` Reported volume/cap is ${((metrics.volume24h / metrics.marketCap) * 100).toFixed(2)}%.`
    : "";
  return [
    `${tokenName} moved ${change} over 24h.${turnover} That is a movement snapshot, not evidence of persistence; the useful follow-up is whether the same relationship survives the next daily close.`,
    marketDataAttribution(metrics),
  ].filter(Boolean).join("\n");
}

function fallbackTikTokCaption(tokenName: string, symbol: string, metrics: MarketContext): string {
  return [
    `${tokenName} moved ${formatSocialChange(metrics.priceChange24h)}. The useful tension is whether reported turnover confirms the attention.`,
    marketDataAttribution(metrics),
    "save this and compare the next daily close.",
    `@tokenradarco #${symbol.toUpperCase()} #Crypto #TokenRadar`,
  ].filter(Boolean).join("\n\n");
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

const INSTAGRAM_GENERIC_HASHTAGS = new Set([
  ...TIKTOK_GENERIC_HASHTAGS,
  "#instagood",
  "#reels",
  "#reelsinstagram",
  "#explorepage",
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

export function prepareInstagramCaptionForPublishing(
  caption: string,
  symbol: string,
  maxChars: number = SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT,
): string {
  const cleaned = compactTikTokBody(caption);
  const rawTags = cleaned.match(/#[a-zA-Z0-9_]+/g) || [];
  const body = compactTikTokBody(cleaned.replace(/#[a-zA-Z0-9_]+/g, ""));
  const fallbackTags = [
    symbolToHashtag(symbol),
    "#CryptoResearch",
    "#MarketStructure",
    "#TokenRadar",
  ].filter((tag): tag is string => Boolean(tag));
  const seen = new Set<string>();
  const tags = [...rawTags, ...fallbackTags]
    .map(normalizeHashtag)
    .filter(Boolean)
    .filter((tag) => !INSTAGRAM_GENERIC_HASHTAGS.has(tag.toLowerCase()))
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
  const hashtagLine = tags.join(" ");
  const bodyBudget = maxChars - (hashtagLine ? hashtagLine.length + 2 : 0);
  const safeBody = bodyBudget > 0
    ? truncateText(body || "TokenRadar market research snapshot.", bodyBudget)
    : "";
  return compactTikTokBody([safeBody, hashtagLine].filter(Boolean).join("\n\n"));
}

export function prepareTikTokCaptionForPublishing(
  caption: string,
  symbol: string,
  maxChars: number = SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT,
  editorialOptions: SocialEditorialOptions = editorialOptionsForToken("", symbol, "throw"),
): string {
  const cleaned = compactTikTokBody(
    sanitizeSocialEditorialText(sanitizePostTextLinks(caption), editorialOptions),
  );
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
  }).slice(0, 3);

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

function truncateXCaptionAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  const hashtagMatch = text.match(/(?:\s+#[a-zA-Z0-9_]+){1,2}\s*$/);
  const hashtags = hashtagMatch?.[0].trim() || "";
  const body = hashtags ? text.slice(0, hashtagMatch?.index).trim() : text.trim();
  const bodyBudget = Math.max(1, maxChars - (hashtags ? hashtags.length + 1 : 0));
  let safeBody = truncateTextAtBoundary(body, bodyBudget);

  if (safeBody && !/[.!?]$/.test(safeBody) && safeBody.length < bodyBudget) {
    safeBody += ".";
  }

  return [safeBody, hashtags].filter(Boolean).join(" ").slice(0, maxChars).trim();
}

function removeXHashtags(text: string): string {
  return text
    .replace(/(^|\s)#[a-zA-Z0-9_]+/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fallbackTelegramSummary(
  tokenName: string,
  symbol: string,
  metrics: MarketContext,
  maxChars: number,
): string {
  const riskScore = formatOptionalScore(metrics.riskScore, 10);
  const summary = [
    `<b>Radar Read: $${symbol.toUpperCase()} (${tokenName})</b>`,
    `Setup: ${formatSocialChange(metrics.priceChange24h)} over 24h, price <b>${formatSocialPrice(metrics.price)}</b>, market cap <b>${formatSocialMarketCap(metrics.marketCap)}</b>.`,
    `Why it matters: selection reason is ${metrics.selectionReason || "market spotlight"} with risk score <b>${riskScore}</b>.`,
    marketDataAttribution(metrics),
    `Risk / invalidation: treat the snapshot as inconclusive until liquidity and trend confirmation align.`,
    `<tg-spoiler>TokenRadar read: this remains watchlist research.</tg-spoiler>`,
  ].filter(Boolean).join("\n");

  return ensureHtmlTagsClosed(truncateTextAtBoundary(summary, maxChars), ["b", "tg-spoiler"]);
}

function fallbackXTweet(
  tokenName: string,
  symbol: string,
  metrics: MarketContext,
  maxChars: number,
): string {
  const cashtag = `$${symbol.toUpperCase()}`;
  const change = formatSocialChange(metrics.priceChange24h);
  const risk = metrics.riskScore === undefined ? "" : ` Supplied Risk: ${metrics.riskScore}/10.`;
  const turnover = typeof metrics.volume24h === "number" && Number.isFinite(metrics.volume24h)
    && typeof metrics.marketCap === "number" && Number.isFinite(metrics.marketCap) && metrics.marketCap > 0
    ? ` Reported volume/cap: ${((metrics.volume24h / metrics.marketCap) * 100).toFixed(2)}%.`
    : "";
  const frames = [
    `${cashtag} moved ${change} over 24h.${turnover} The snapshot shows movement and reported turnover, not durability.`,
    `${cashtag}: ${change} over 24h.${risk} Price direction and the supplied score answer different questions.`,
    `${tokenName} snapshot: ${cashtag} is ${change} over 24h.${turnover} Next check: whether the same relationship persists.`,
    `${cashtag} is ${change} over 24h.${risk}${turnover} One snapshot is a starting point, not a trend.`,
  ];
  const seed = `${symbol}:${tokenName}:${metrics.selectionReason || "market-watchlist"}`.toLowerCase();
  const index = Math.abs(seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % frames.length;
  const tweet = frames[index];
  const attribution = marketDataAttribution(metrics);
  if (!attribution) return truncateXCaptionAtBoundary(tweet, maxChars);

  const bodyBudget = Math.max(1, maxChars - attribution.length - 1);
  return `${truncateXCaptionAtBoundary(tweet, bodyBudget)}\n${attribution}`.slice(0, maxChars).trim();
}

function fallbackYoutubeMetadata(
  tokenName: string,
  symbol: string,
  metrics: MarketContext,
): { title: string; description: string } {
  const title = truncateText(`${tokenName} ($${symbol.toUpperCase()}) 24h Market Update`, 60);
  const description = [
    `${tokenName} is moving ${formatSocialChange(metrics.priceChange24h)} over 24h, with price near ${formatSocialPrice(metrics.price)} and market cap around ${formatSocialMarketCap(metrics.marketCap)}.`,
    marketDataAttribution(metrics),
    `Full data report & analytics: ${SOCIAL.ecosystemUrl}`,
    `#Shorts #${symbol.toUpperCase()} #Crypto`,
  ].filter(Boolean).join("\n");
  return { title, description };
}

function normalizeTelegramSummarySections(text: string): string {
  return text
    .replace(/<\/b>[ \t]*(Setup:)/i, "</b>\n$1")
    .replace(/([.!?])[ \t]*(Why it matters:)/i, "$1\n$2")
    .replace(/([.!?])[ \t]*(Risk\s*\/\s*invalidation:)/i, "$1\n$2")
    .replace(/([.!?])[ \t]*(<tg-spoiler>)/i, "$1\n$2");
}

function enforceUnifiedCaptionLimits(
  captions: UnifiedSocialCaptions,
  options: UnifiedCaptionOptions,
  tokenName: string,
  symbol: string,
): UnifiedSocialCaptions {
  const next: UnifiedSocialCaptions = { ...captions };
  const editorialOptions = editorialOptionsForToken(tokenName, symbol, "preserve");

  if (next.telegramSummary) {
    next.telegramSummary = normalizeTelegramSummarySections(
      sanitizeSocialEditorialText(sanitizeTelegramPostLinks(next.telegramSummary), editorialOptions),
    );
  }
  if (next.telegramSummary && options.telegramMaxChars) {
    next.telegramSummary = ensureHtmlTagsClosed(
      truncateTextAtBoundary(next.telegramSummary, options.telegramMaxChars),
      ["b", "tg-spoiler"],
    );
  }
  if (next.xTweet) {
    next.xTweet = sanitizeSocialEditorialText(sanitizePostTextLinks(next.xTweet), editorialOptions);
    next.xTweet = sanitizeCashtags(next.xTweet);
    next.xTweet = removeXHashtags(next.xTweet);
    next.xTweet = truncateXCaptionAtBoundary(
      next.xTweet,
      options.xMaxChars ?? SOCIAL_PLATFORM_LIMITS.X.CHAR_LIMIT,
    );
  }
  if (next.youtubeDescription) {
    next.youtubeDescription = sanitizeSocialEditorialText(
      sanitizePostTextLinks(next.youtubeDescription),
      editorialOptions,
    );
  }
  if (next.youtubeTitle) {
    next.youtubeTitle = sanitizeSocialEditorialText(
      sanitizePostTextLinks(next.youtubeTitle),
      editorialOptions,
    );
    next.youtubeTitle = truncateText(next.youtubeTitle, options.youtubeTitleMaxChars ?? 60);
  }
  if (next.instagramCaption) {
    next.instagramCaption = sanitizeSocialEditorialText(
      sanitizePostTextLinks(next.instagramCaption),
      editorialOptions,
    );
    next.instagramCaption = prepareInstagramCaptionForPublishing(
      next.instagramCaption,
      symbol,
      options.instagramMaxChars ?? SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT,
    );
  }
  if (next.threadsCaption) {
    next.threadsCaption = sanitizeSocialEditorialText(
      sanitizePostTextLinks(next.threadsCaption),
      editorialOptions,
    );
    next.threadsCaption = truncateTextAtBoundary(
      next.threadsCaption,
      options.threadsMaxChars ?? SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT,
    );
  }
  if (next.tiktokCaption) {
    next.tiktokCaption = prepareTikTokCaptionForPublishing(
      next.tiktokCaption,
      symbol,
      options.tiktokMaxChars ?? SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT,
      editorialOptions,
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
    next.threadsSpoilerText ||= "";
  }

  if (platforms.includes("tiktok") && !next.tiktokCaption) {
    next.tiktokCaption = fallbackTikTokCaption(tokenName, symbol, metrics);
  }

  return enforceUnifiedCaptionLimits(next, options, tokenName, symbol);
}

function validateUnifiedCaptionsForPublishing(
  captions: UnifiedSocialCaptions,
  facts: SocialContentFacts,
  platforms: PlatformTarget[],
): SocialCaptionValidationFailure["fields"] {
  const surfaces: Partial<Record<PlatformTarget, { field: UnifiedCaptionField; text: string }>> = {
    telegram: captions.telegramSummary
      ? { field: "telegramSummary", text: captions.telegramSummary }
      : undefined,
    x: captions.xTweet
      ? { field: "xTweet", text: captions.xTweet }
      : undefined,
    youtube: captions.youtubeTitle || captions.youtubeDescription
      ? {
          field: "youtubeDescription",
          text: [captions.youtubeTitle, captions.youtubeDescription].filter(Boolean).join("\n"),
        }
      : undefined,
    instagram: captions.instagramCaption
      ? { field: "instagramCaption", text: captions.instagramCaption }
      : undefined,
    threads: captions.threadsCaption
      ? { field: "threadsCaption", text: captions.threadsCaption }
      : undefined,
    tiktok: captions.tiktokCaption
      ? { field: "tiktokCaption", text: captions.tiktokCaption }
      : undefined,
  };

  const failures: SocialCaptionValidationFailure["fields"] = [];
  for (const platform of platforms) {
    const surface = surfaces[platform];
    if (!surface) continue;
    const validation = validateSocialContent(surface.text, facts);
    if (!validation.ok) failures.push({ field: surface.field, issues: validation.issues });
  }
  return failures;
}

async function reportCaptionValidationFailure(
  failure: SocialCaptionValidationFailure,
  facts: SocialContentFacts,
  options: UnifiedCaptionOptions,
): Promise<void> {
  const summary = failure.fields
    .flatMap(({ field, issues }) => issues.map((issue) => `${field}:${issue.code}`))
    .join(", ");
  console.warn(
    `  [social-content-quarantine] Rejected generated captions for ${failure.tokenName} ($${failure.symbol.toUpperCase()}), attempt ${failure.attempt}: ${summary}`,
  );

  const persisted = persistNeedsReviewRecord({
    tokenName: failure.tokenName,
    symbol: failure.symbol,
    platforms: failure.platforms,
    generationAttempt: failure.attempt,
    facts,
    issues: failure.fields,
  }, {
    rootDir: options.reviewQueueRootDir,
  });
  console.warn(`  [social-content-quarantine] Review metadata saved to ${persisted.path}`);

  try {
    options.onValidationFailure?.(failure);
  } catch (error) {
    console.warn(`  Social validation audit hook failed: ${formatErrorForLog(error)}`);
  }
}

export class SocialCaptionQuarantinedError extends Error {
  readonly fields: SocialCaptionValidationFailure["fields"];

  constructor(tokenName: string, fields: SocialCaptionValidationFailure["fields"]) {
    super(`No publishable social caption could be produced for ${tokenName}.`);
    this.name = "SocialCaptionQuarantinedError";
    this.fields = fields;
  }
}

async function buildValidatedUnifiedFallback(
  tokenName: string,
  symbol: string,
  metrics: MarketContext,
  platforms: PlatformTarget[],
  options: UnifiedCaptionOptions,
): Promise<UnifiedSocialCaptions> {
  const fallback = await fillMissingUnifiedCaptionFields(
    {},
    tokenName,
    symbol,
    metrics,
    platforms,
    options,
  );
  const failures = validateUnifiedCaptionsForPublishing(
    fallback,
    buildSocialContentFacts(tokenName, symbol, metrics),
    platforms,
  );
  if (failures.length > 0) throw new SocialCaptionQuarantinedError(tokenName, failures);
  return fallback;
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
  const platformArchetypes = uniquePlatforms.reduce((acc, platform) => {
    const configuredArchetype = options.contentArchetypes?.[platform];
    const selected = configuredArchetype
      ? resolveSocialArchetype(configuredArchetype, platform)
      : selectSocialArchetype({
          platform,
          seedParts: [
            symbol,
            tokenName,
            metrics.selectionReason,
            metrics.timeOfDay,
          ],
        });
    // Metric methodology is not part of MarketContext. Until exact structured
    // definitions are supplied, education about how a proprietary score works
    // must use a deterministic editorial format rather than free-form AI copy.
    acc[platform] = selected.key === "how_to_read_metric"
      ? resolveSocialArchetype("single_token_snapshot", platform)
      : selected;
    return acc;
  }, {} as Partial<Record<PlatformTarget, SocialContentArchetype>>);

  const contentArchetypeBrief = uniquePlatforms
    .map((platform) => formatArchetypePromptLine(platform, platformArchetypes[platform]!))
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
  const requiredMarketAttribution = marketDataAttribution(metrics);
  const marketAttributionRule = requiredMarketAttribution
    ? `For every requested platform, any price/change/market-cap/volume/rank claim must include this exact source line: "${requiredMarketAttribution}".`
    : "No complete public market source/as-of pair was supplied. Do not call the snapshot live, real-time, or current.";

  const platformRuleBlocks: Partial<Record<PlatformTarget, string>> = {
    telegram: `
TELEGRAM RULES:
- Return "telegramSummary" only for Telegram.
- Maximum ${options.telegramMaxChars ?? SOCIAL_PLATFORM_LIMITS.TELEGRAM.AI_SUMMARY_CHARS} characters.
- Write like a premium crypto research desk read, not a generic social update.
- Today's Telegram angle: ${platformVariants.telegram?.label} - ${platformVariants.telegram?.angle}.
- Today's Telegram archetype: ${platformArchetypes.telegram?.label} - ${platformArchetypes.telegram?.angle}.
- Use one of these compact structures, selected to match the archetype:
  1. <b>Radar Read: $${symbol.toUpperCase()} (${tokenName})</b>; Setup: ...; Risk / invalidation: ...; <tg-spoiler>TokenRadar read: ...</tg-spoiler>
  2. <b>Market Desk: $${symbol.toUpperCase()}</b>; What changed: ...; What confirms: ...; What breaks: ...
  3. <b>Risk Lab: $${symbol.toUpperCase()}</b>; Why it is noisy: ...; What would make it cleaner: ...; Research note: ...
- Use <b> tags only for specific numbers and key metrics.
- Do not say buy, sell, long, short, signal, entry, take-profit, guaranteed, or financial advice.
- No URLs, external links, markdown, numbered lists, or unsupported HTML tags.`,
    x: `
X RULES:
- Return "xTweet" only for X.
- Maximum ${options.xMaxChars ?? SOCIAL_PLATFORM_LIMITS.X.CHAR_LIMIT} characters.
- Today's X angle: ${platformVariants.x?.label} - ${platformVariants.x?.angle}.
- Today's X archetype: ${platformArchetypes.x?.label} - ${platformArchetypes.x?.angle}.
- Hook family: ${platformArchetypes.x?.hookFamily}. CTA family: ${platformArchetypes.x?.ctaFamily}.
- Write one complete research note in this order: claim, supplied evidence, consequence or invalidation.
- Include at least one concrete supplied metric and one tension, filter, or condition that changes the read.
- Use exactly one cashtag: $${symbol.toUpperCase()}.
- Write prices with a currency prefix (for example, $1.23) so each number is unambiguous.
- A question is allowed only when it is specific and necessary to the selected archetype. Never use generic engagement bait.
- Do not include hashtags. The cashtag supplies the discovery context.
- Do not invent comparisons, audience results, tokens, events, or metrics that are not in the supplied context.
- Do not use "GM", "fam", "on my radar", "thoughts?", or "what else should I watch?".
- End with a complete sentence. Never end with an ellipsis or a cut-off thought.
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
- State one conclusion or tension and one concrete follow-up or invalidation condition.
- Include 3-5 targeted hashtags at the end. Never add generic reach tags.
- Use emojis sparingly and do not use rocket emojis.`,
    threads: `
THREADS RULES:
- Return "threadsCaption", "threadsTopicTag", and "threadsSpoilerText".
- Maximum ${options.threadsMaxChars ?? SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT} characters for threadsCaption.
- Today's Threads angle: ${platformVariants.threads?.label} - ${platformVariants.threads?.angle}.
- Write a text-native research note in no more than 2 short paragraphs.
- Open with a defensible thesis or tension, support it with at least one supplied metric, and name what would change the read.
- threadsSpoilerText must be an exact substring of threadsCaption and should hide the conclusion or invalidation phrase, not the token name.
- Do not use generic prompts such as "thoughts?", "agree?", or "what do you think?".
- Do not use hashtags, @mentions, recycled video language, or unsupported comparisons.
- threadsTopicTag must be one single word, 1-50 characters, without #, dots, ampersands, or spaces.
- Do not mention @tokenradarco.`,
    tiktok: `
TIKTOK RULES:
- Return "tiktokCaption" only for TikTok.
- Maximum ${options.tiktokMaxChars ?? SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT} characters.
- Today's TikTok angle: ${platformVariants.tiktok?.label} - ${platformVariants.tiktok?.angle}.
- Treat tiktokCaption as the TikTok video description/caption.
- Aim for 100-180 characters. Shorter is better on TikTok.
- Use at most two supplied numeric facts and show their source/as-of line. Never imply that numbers themselves cause suppression.
- Write in concise, creator-native language without pretending that a viewer requested the token.
- Structure:
  Line 1: a data-led hook about ${tokenName} that creates curiosity without inventing a viewer request.
  Line 2: one supplied fact and the tension it creates.
  Line 3: a useful follow-up action such as saving the snapshot or choosing the next evidence check; no generic engagement bait.
  Final line: @tokenradarco plus hashtags.
- Mention @tokenradarco once.
- End with exactly 3 hashtags. Use the token symbol, #Crypto, and #TokenRadar.
- Do not use generic reach tags such as #FYP, #ForYou, #ForYouPage, #viral, or #trending.
- Do not say buy, sell, long, short, signal, entry, take-profit, guaranteed, financial advice, or price prediction.
- No URLs, markdown, HTML, unsupported symbols, AI disclaimers, or rocket emojis.`,
  };

  const priceStr = formatSocialPrice(metrics.price);
  const changeStr = formatSocialChange(metrics.priceChange24h);
  const marketCapStr = formatSocialMarketCap(metrics.marketCap);
  const riskScore = formatOptionalScore(metrics.riskScore, 10);
  const growthScore = formatOptionalScore(metrics.growthPotentialIndex, 100);
  const riskProfile = riskScore === "N/A"
    ? "N/A"
    : `${getRiskGauge(metrics.riskScore)} (Score: ${riskScore})`;
  // Free-form third-party context is excluded from the instruction body. Only
  // typed numeric fields and controlled enum-like selection metadata are used.
  const socialContextSection = "";
  // Project descriptions are third-party, project-controlled text. They are
  // deliberately excluded from publish-time prompts so they cannot inject
  // instructions or be mistaken for verified facts.
  void description;
  const descriptionSection = `${tokenName} is tracked under the symbol ${symbol.toUpperCase()}. No project-supplied description is provided as a factual source.`;

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

CONTENT ARCHETYPE BRIEF:
${contentArchetypeBrief}

EDITORIAL FORMAT BRIEF:
${editorialFormatBrief}

MARKET DATA:
Token: ${tokenName} (${symbol.toUpperCase()})
Price: ${priceStr}
24h Change: ${changeStr}
Market Cap: ${marketCapStr} (Rank: #${metrics.marketCapRank ?? "N/A"})
24h Volume: ${formatSocialMarketCap(metrics.volume24h)}
Market Data Source: ${metrics.marketDataSource || "N/A"}
Market Data As Of: ${metrics.marketDataAsOf || "N/A"}
Risk Profile: ${riskProfile}
Growth Index: ${growthScore}
Selection Reason: ${metrics.selectionReason || "market spotlight"}
Trending Context: N/A (free-form third-party text excluded)
Global Market: N/A (free-form third-party text excluded)
Sector Performance: N/A (free-form third-party text excluded)
Community: ${metrics.twitterFollowers !== undefined ? `${metrics.twitterFollowers.toLocaleString("en-US")} Twitter followers` : "N/A"}${metrics.redditSubscribers !== undefined ? `, ${metrics.redditSubscribers.toLocaleString("en-US")} Reddit subscribers` : ""}
Developer: ${metrics.githubCommits4Weeks === undefined || metrics.githubCommits4Weeks === null ? "N/A (no developer data supplied)" : `${metrics.githubCommits4Weeks} GitHub commits in 4 weeks`}
${socialContextSection}
BACKGROUND CONTEXT:
${descriptionSection}

FACTUALITY AND SAFETY GATE:
- Use only the explicit fields above. Do not infer hidden flows, institutional or whale activity, order-book state, derivatives positioning, holders, buy/sell ratios, wallets, support/resistance levels, catalysts, or causation.
- An absolute 24h volume number does not support claims that volume is flat, surging, rising, falling, spiking, drying up, or above/below average. No spread/depth data is supplied, so do not describe liquidity as thin, deep, high, low, rising, or falling.
- Quote Risk Profile and Growth Index only as scores. Their methodology is not supplied here, so do not say what either score measures, uses, or proves.
- Developer data marked N/A must be omitted or called N/A; never convert missing data into "no activity". A supplied zero means exactly 0 GitHub commits in 4 weeks, not general inactivity.
- Do not direct the reader to buy, sell, invest, accumulate, enter, commit capital, make a move, open a position, or execute a trade. Do not soften those instructions with euphemisms.
- Every percentage, currency amount, score, rank, follower/subscriber count, or commit count must exactly match a supplied fact.
- ${marketAttributionRule}

STRICT PLATFORM RULES:
${uniquePlatforms.map((platform) => platformRuleBlocks[platform]).join("\n")}
`;

  const facts = buildSocialContentFacts(tokenName, symbol, metrics);
  const regenerationAttempts = Math.min(
    2,
    Math.max(0, Math.floor(options.validationRegenerationAttempts ?? 1)),
  );
  let validationFeedback = "";
  let lastGenerationError: unknown;

  for (let attemptIndex = 0; attemptIndex <= regenerationAttempts; attemptIndex += 1) {
    try {
      const repairPrompt = validationFeedback
        ? `${prompt}\n\nREGENERATION REQUIREMENT:\nThe previous candidate was quarantined by deterministic validation. Produce completely new copy and fix every issue below. Do not repeat or euphemistically rephrase a blocked claim.\n${validationFeedback}`
        : prompt;
      const result = await callAIWithFallback(
        "",
        repairPrompt,
        getUnifiedCaptionMaxTokens(uniquePlatforms),
        buildUnifiedCaptionSchema(uniquePlatforms),
        {
          usageActivity: {
            contentKey: `${symbol.toUpperCase()}:${uniquePlatforms.join(",")}`,
            operation: "unified-social-captions",
            attempt: attemptIndex + 1,
          },
        },
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

      const candidate = await fillMissingUnifiedCaptionFields(
        captions,
        tokenName,
        symbol,
        metrics,
        uniquePlatforms,
        options,
      );
      const failures = validateUnifiedCaptionsForPublishing(candidate, facts, uniquePlatforms);
      if (failures.length === 0) return candidate;

      const failure: SocialCaptionValidationFailure = {
        tokenName,
        symbol,
        attempt: attemptIndex + 1,
        platforms: uniquePlatforms,
        fields: failures,
      };
      await reportCaptionValidationFailure(failure, facts, options);
      validationFeedback = failures
        .flatMap(({ field, issues }) => issues.map((issue) => `- ${field}: ${issue.message}`))
        .join("\n");
    } catch (error) {
      lastGenerationError = error;
      console.warn(
        `  Failed unified-caption generation attempt ${attemptIndex + 1} for ${tokenName}: ${formatErrorForLog(error)}`,
      );
    }
  }

  console.warn(
    `  Generated captions for ${tokenName} remained unavailable or quarantined. Using validated deterministic fallbacks.${lastGenerationError ? ` Last error: ${formatErrorForLog(lastGenerationError)}` : ""}`,
  );
  return buildValidatedUnifiedFallback(
    tokenName,
    symbol,
    metrics,
    uniquePlatforms,
    options,
  );
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
    Time of day: ${timeOfDay}.
    ${tokenCtx}${priceCtx}${changeCtx}
    
    Write like a concise research desk asking one specific, answerable question.
    STRICT RULES:
    1. Maximum 120 characters to leave room for poll options and hashtags.
    2. Do not include the actual poll options in your text.
    3. Do NOT include hashtags or links.
    4. Do NOT use cashtags (e.g. $BTC, $ETH). The cashtag will be added separately by the system.
    5. Do NOT use dollar signs for prices — write prices as plain numbers (e.g. '21.64' not '$21.64').
    6. EXTERNAL LINKS: NEVER include URLs, external links, third-party domains, or ads. The only permitted site is tokenradar.co.
    7. Avoid buy/sell advice, hype, moon language, guaranteed outcomes, and urgency.
    8. Do not use "GM", "fam", generic news questions, or engagement bait.
    9. Anchor the hook in the supplied token metric or in the named research filter.
  `;

  try {
    const result = await callAIWithFallback("", prompt, 512);
    const resolvedTokenName = tokenName || "Crypto market";
    const resolvedSymbol = symbol || "CRYPTO";
    const cleaned = sanitizeSocialEditorialText(
      sanitizePostTextLinks(result.content || ""),
      editorialOptionsForToken(resolvedTokenName, resolvedSymbol, "preserve"),
    );
    const facts: SocialContentFacts = {
      ...buildSocialContentFacts(resolvedTokenName, resolvedSymbol, metrics || {}),
      // A 120-character poll hook cannot carry the full public attribution;
      // numeric values are already prohibited by the prompt.
      marketDataSource: undefined,
      marketDataAsOf: undefined,
    };
    const validation = validateSocialContent(cleaned, facts);
    if (!validation.ok) {
      persistNeedsReviewRecord({
        tokenName: resolvedTokenName,
        symbol: resolvedSymbol,
        platforms: ["x"],
        generationAttempt: 1,
        facts,
        issues: [{ field: "xTweet", issues: validation.issues }],
      });
      throw new SocialCaptionQuarantinedError(resolvedTokenName, [
        { field: "xTweet", issues: validation.issues },
      ]);
    }
    return cleaned;
  } catch (error) {
    console.warn(`  ⚠ AI poll hook generation failed or was quarantined: ${formatErrorForLog(error)}`);
    // Fallback template
    return symbol
      ? `How are you reading ${symbol.toUpperCase()} today?`
      : `Which crypto narrative deserves more research this week?`;
  }
}

