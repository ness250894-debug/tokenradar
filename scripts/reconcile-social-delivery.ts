import { pathToFileURL } from "url";
import * as path from "path";

import {
  getSocialPostLookup,
  reconcileSocialDeliveryAsPublished,
  releaseSocialDeliveryForVerifiedRetry,
  type SocialPostLookupState,
} from "../src/lib/ops-ledger";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1]?.trim() : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

export type SocialDeliveryReconciliationAction =
  | { mode: "published"; externalId: string }
  | { mode: "release"; verificationNote: string };

export function parseSocialDeliveryReconciliationAction(
  args: string[],
): SocialDeliveryReconciliationAction {
  const hasPublishedFlag = args.includes("--published-external-id");
  const hasReleaseFlag = args.includes("--release");
  const hasVerificationFlag = args.includes("--verified-no-public-post");
  const hasNoteFlag = args.includes("--note");
  const hasAnyReleaseFlag = hasReleaseFlag || hasVerificationFlag || hasNoteFlag;

  if (hasPublishedFlag && hasAnyReleaseFlag) {
    throw new Error("Choose either --published-external-id or the verified release path, not both.");
  }
  if (hasPublishedFlag) {
    const externalId = argValue(args, "--published-external-id");
    if (!externalId) throw new Error("--published-external-id requires a public platform ID.");
    return { mode: "published", externalId };
  }
  if (hasAnyReleaseFlag) {
    if (!hasReleaseFlag || !hasVerificationFlag || !hasNoteFlag) {
      throw new Error("The release path requires --release --verified-no-public-post --note <specific public-feed evidence>.");
    }
    const verificationNote = argValue(args, "--note");
    if (!verificationNote) {
      throw new Error("The verified release path requires --note <specific public-feed evidence>.");
    }
    return { mode: "release", verificationNote };
  }

  throw new Error("Choose either --published-external-id or the explicit --release --verified-no-public-post --note path.");
}

export function isReconcilableSocialDeliveryState(
  state: SocialPostLookupState,
  mode: SocialDeliveryReconciliationAction["mode"],
): boolean {
  if (mode === "published") {
    return state === "planned"
      || state === "failed"
      || state === "outcome_unknown";
  }
  return state === "planned" || state === "outcome_unknown";
}

export async function reconcileSocialDelivery(): Promise<void> {
  const args = process.argv.slice(2);
  const platform = argValue(args, "--platform");
  const contentKey = argValue(args, "--content-key");
  if (!platform || !contentKey) {
    throw new Error("Usage: --platform <name> --content-key <stable-key> [--published-external-id <id> | --release --verified-no-public-post --note <evidence>]");
  }
  const action = parseSocialDeliveryReconciliationAction(args);

  const before = await getSocialPostLookup(platform, contentKey);
  console.log(`Current delivery: ${platform}/${contentKey} = ${before.state}${before.externalId ? ` (${before.externalId})` : ""}`);
  if (before.state === "published") {
    if (action.mode === "published" && before.externalId === action.externalId) {
      await reconcileSocialDeliveryAsPublished({ platform, contentKey, externalId: action.externalId });
      console.log("Matching public evidence was verified and any interrupted delivery row was finalized.");
      return;
    }
    throw new Error(`Delivery ${platform}/${contentKey} is already published and cannot be reconciled again.`);
  }
  if (!isReconcilableSocialDeliveryState(before.state, action.mode)) {
    const publishingGuidance = before.state === "publishing"
      ? " Wait for the owning workflow to stop; active publishing attempts are intentionally not eligible for operator takeover."
      : "";
    throw new Error(
      `Delivery ${platform}/${contentKey} is ${before.state}; refusing to create or overwrite reconciliation evidence.${publishingGuidance}`,
    );
  }

  if (action.mode === "published") {
    await reconcileSocialDeliveryAsPublished({
      platform,
      contentKey,
      externalId: action.externalId,
    });
  } else {
    await releaseSocialDeliveryForVerifiedRetry({
      platform,
      contentKey,
      verificationNote: action.verificationNote,
    });
  }

  const after = await getSocialPostLookup(platform, contentKey);
  console.log(`Reconciled delivery: ${platform}/${contentKey} = ${after.state}${after.externalId ? ` (${after.externalId})` : ""}`);
}

const isDirectExecution = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  reconcileSocialDelivery().catch((error) => {
    console.error(`Social delivery reconciliation failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  });
}
