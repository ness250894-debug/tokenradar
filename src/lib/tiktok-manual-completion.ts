export interface TikTokManualCompletionInput {
  operator: string;
  publishedAt?: string;
  tiktokUrl?: string;
  postId?: string;
}

export interface TikTokManualCompletionTracker {
  postedAt?: string;
  tokenId?: string;
  tokenName?: string;
  reason?: string;
  platform?: string;
  platforms: {
    tiktok?: Record<string, unknown>;
    [platform: string]: Record<string, unknown> | undefined;
  };
}

export type TikTokManualCompletionIssue =
  | "operator-required"
  | "tiktok-url-or-post-id-required"
  | "published-at-invalid";

function isValidIsoDate(value: string | undefined): boolean {
  if (!value) return true;
  return !Number.isNaN(Date.parse(value));
}

export function validateTikTokManualCompletionInput(
  input: TikTokManualCompletionInput,
): TikTokManualCompletionIssue[] {
  const issues: TikTokManualCompletionIssue[] = [];
  if (!input.operator.trim()) issues.push("operator-required");
  if (!input.tiktokUrl?.trim() && !input.postId?.trim()) issues.push("tiktok-url-or-post-id-required");
  if (!isValidIsoDate(input.publishedAt)) issues.push("published-at-invalid");
  return issues;
}

export function recordTikTokManualCompletion<TTracker extends TikTokManualCompletionTracker>(
  tracker: TTracker,
  input: TikTokManualCompletionInput,
): TTracker {
  const issues = validateTikTokManualCompletionInput(input);
  if (issues.length > 0) {
    throw new Error(`Invalid TikTok manual completion: ${issues.join(", ")}`);
  }

  const publishedAt = input.publishedAt ? new Date(input.publishedAt).toISOString() : new Date().toISOString();
  const currentTikTok = tracker.platforms.tiktok || {};

  return {
    ...tracker,
    postedAt: tracker.postedAt || publishedAt,
    platforms: {
      ...tracker.platforms,
      tiktok: {
        ...currentTikTok,
        status: "manual_published",
        manualPublishedAt: publishedAt,
        tiktokUrl: input.tiktokUrl?.trim() || undefined,
        postId: input.postId?.trim() || currentTikTok.postId,
        humanOperator: input.operator.trim(),
      },
    },
  };
}
