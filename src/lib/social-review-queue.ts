import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import type { SocialContentFacts, SocialContentValidationIssue } from "./social-content-validator";

export type SocialReviewState =
  | "generated"
  | "validated"
  | "needs_review"
  | "approved"
  | "rejected";

export interface SocialReviewRecord {
  id: string;
  schemaVersion: 1;
  state: SocialReviewState;
  createdAt: string;
  updatedAt: string;
  tokenName: string;
  symbol: string;
  platforms: string[];
  generationAttempt: number;
  facts: Omit<SocialContentFacts, "suppliedContext">;
  issues: Array<{
    field: string;
    codes: SocialContentValidationIssue["code"][];
  }>;
  stateHistory: Array<{
    state: SocialReviewState;
    at: string;
    actor: "validator" | "reviewer";
  }>;
  reviewer?: string;
}

export interface PersistSocialReviewInput {
  tokenName: string;
  symbol: string;
  platforms: string[];
  generationAttempt: number;
  facts: SocialContentFacts;
  issues: Array<{
    field: string;
    issues: SocialContentValidationIssue[];
  }>;
}

export interface SocialReviewQueueOptions {
  /** Defaults inside data/posted so the existing social-state cache preserves it between Actions runs. */
  rootDir?: string;
  now?: Date;
}

export interface PersistedSocialReview {
  path: string;
  record: SocialReviewRecord;
}

const ALLOWED_TRANSITIONS: Record<SocialReviewState, SocialReviewState[]> = {
  generated: ["validated", "needs_review", "rejected"],
  validated: ["approved", "rejected"],
  needs_review: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

function isSocialReviewState(value: unknown): value is SocialReviewState {
  return typeof value === "string"
    && Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, value);
}

function queueRoot(options: SocialReviewQueueOptions): string {
  return options.rootDir
    || process.env.SOCIAL_REVIEW_QUEUE_DIR
    || path.resolve(process.cwd(), "data", "posted", "review-queue");
}

function publicFacts(facts: SocialContentFacts): Omit<SocialContentFacts, "suppliedContext"> {
  const { suppliedContext: _suppliedContext, ...safeFacts } = facts;
  return safeFacts;
}

function writeJsonAtomically(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

/**
 * Persists metadata only. Rejected text is deliberately excluded so unsafe
 * instructions cannot become a prompt or copy source in the review queue.
 */
export function persistNeedsReviewRecord(
  input: PersistSocialReviewInput,
  options: SocialReviewQueueOptions = {},
): PersistedSocialReview {
  const now = options.now || new Date();
  const timestamp = now.toISOString();
  const id = `${timestamp.slice(0, 10)}-${randomUUID()}`;
  const record: SocialReviewRecord = {
    id,
    schemaVersion: 1,
    state: "needs_review",
    createdAt: timestamp,
    updatedAt: timestamp,
    tokenName: input.tokenName,
    symbol: input.symbol.toUpperCase(),
    platforms: Array.from(new Set(input.platforms)).sort(),
    generationAttempt: input.generationAttempt,
    facts: publicFacts(input.facts),
    issues: input.issues.map(({ field, issues }) => ({
      field,
      codes: Array.from(new Set(issues.map((issue) => issue.code))).sort(),
    })),
    stateHistory: [
      { state: "generated", at: timestamp, actor: "validator" },
      { state: "needs_review", at: timestamp, actor: "validator" },
    ],
  };
  const recordPath = path.join(queueRoot(options), timestamp.slice(0, 10), `${id}.json`);
  writeJsonAtomically(recordPath, record);
  return { path: recordPath, record };
}

export function transitionSocialReviewRecord(
  recordPath: string,
  nextState: SocialReviewState,
  reviewer: string,
  now: Date = new Date(),
): SocialReviewRecord {
  const parsed: unknown = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid social review record: ${recordPath}`);
  }
  const candidate = parsed as Partial<SocialReviewRecord>;
  if (candidate.schemaVersion !== 1) {
    throw new Error(
      `Unsupported social review schema version: ${String(candidate.schemaVersion)}`,
    );
  }
  if (!isSocialReviewState(candidate.state)) {
    throw new Error(`Invalid social review state: ${String(candidate.state)}`);
  }
  if (!Array.isArray(candidate.stateHistory)) {
    throw new Error(`Invalid social review state history: ${recordPath}`);
  }
  const normalizedReviewer = reviewer.trim();
  if (!normalizedReviewer) {
    throw new Error("A non-empty reviewer identity is required for social review transitions.");
  }
  const record = candidate as SocialReviewRecord;
  if (!ALLOWED_TRANSITIONS[record.state].includes(nextState)) {
    throw new Error(`Invalid social review transition: ${record.state} -> ${nextState}`);
  }
  const timestamp = now.toISOString();
  const updated: SocialReviewRecord = {
    ...record,
    state: nextState,
    updatedAt: timestamp,
    reviewer: normalizedReviewer,
    stateHistory: [
      ...record.stateHistory,
      { state: nextState, at: timestamp, actor: "reviewer" },
    ],
  };
  writeJsonAtomically(recordPath, updated);
  return updated;
}

export function isSocialReviewStatePublishable(state: SocialReviewState): boolean {
  return state === "validated" || state === "approved";
}

export function assertSocialReviewRecordPublishable(record: SocialReviewRecord): void {
  if (!isSocialReviewStatePublishable(record.state)) {
    throw new Error(`Social review record ${record.id} is ${record.state}; publication is blocked.`);
  }
}
