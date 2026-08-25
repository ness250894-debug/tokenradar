import { execFileSync } from "child_process";

import { formatErrorForLog } from "./utils";

export type GitHubSecretEnvironment = Record<string, string | undefined>;

/** Persist a secret without putting its value in the child process arguments. */
export function persistGitHubActionsSecret(
  secretName: string,
  secretValue: string,
  env: GitHubSecretEnvironment = process.env,
  execFile: typeof execFileSync = execFileSync,
): void {
  const ghToken = env.GH_TOKEN?.trim();
  if (!ghToken) {
    throw new Error(`GH_TOKEN is required to persist ${secretName} to GitHub Actions secrets.`);
  }

  try {
    execFile("gh", ["secret", "set", secretName], {
      input: secretValue,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env, GH_TOKEN: ghToken },
    });
  } catch (error) {
    throw new Error(
      `Failed to persist ${secretName} to GitHub Actions secrets: ${formatErrorForLog(error)}`,
    );
  }

  console.info(`  [meta-refresh] Persisted ${secretName} to GitHub Actions secrets.`);
}
