import { sanitizeSocialEditorialText } from "../../src/lib/social-editorial";
import { sanitizePostTextLinks } from "../../src/lib/social-link-policy";

export interface TelegramPollPayload {
  question: string;
  options: string[];
}

const FALLBACK_POLL_OPTIONS = [
  "Momentum quality",
  "Liquidity depth",
  "Risk profile",
  "Need more data",
];

function sanitizePollField(value: unknown, maxLength: number): string {
  return sanitizeSocialEditorialText(sanitizePostTextLinks(String(value || "")))
    .slice(0, maxLength)
    .trim();
}

export function normalizeTelegramPollPayload(
  payload: { question?: unknown; options?: unknown },
  fallbackQuestion: string,
): TelegramPollPayload {
  const question =
    sanitizePollField(payload.question, 300) ||
    sanitizePollField(fallbackQuestion, 300);

  const options = Array.isArray(payload.options)
    ? payload.options
        .map((option) => sanitizePollField(option, 100))
        .filter(Boolean)
    : [];
  const uniqueOptions = Array.from(
    new Map(options.map((option) => [option.toLowerCase(), option])).values(),
  );

  for (const fallback of FALLBACK_POLL_OPTIONS) {
    if (uniqueOptions.length >= 4) break;
    if (!uniqueOptions.some((option) => option.toLowerCase() === fallback.toLowerCase())) {
      uniqueOptions.push(fallback);
    }
  }

  return {
    question,
    options: uniqueOptions.slice(0, 4),
  };
}

export function buildTelegramPollPayload(
  payload: { question?: unknown; options?: unknown },
  fallbackQuestion: string,
): TelegramPollPayload {
  const normalized = normalizeTelegramPollPayload(payload, fallbackQuestion);

  if (!normalized.question) {
    throw new Error("AI returned invalid question.");
  }
  if (normalized.options.length !== 4) {
    throw new Error(`AI returned ${normalized.options.length} normalized options, expected 4.`);
  }

  return normalized;
}
