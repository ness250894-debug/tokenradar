import { execFileSync } from "child_process";

import { formatErrorForLog } from "./utils";

export type GitHubSecretEnvironment = Record<string, string | undefined>;

export interface GitHubSecretPersistenceOptions {
  environment?: string;
}

function buildGitHubCliEnvironment(
  env: GitHubSecretEnvironment,
  ghToken: string,
): NodeJS.ProcessEnv {
  const requestedNodeEnvironment = env.NODE_ENV ?? process.env.NODE_ENV;
  const nodeEnvironment: "development" | "production" | "test" =
    requestedNodeEnvironment === "development" ||
    requestedNodeEnvironment === "test" ||
    requestedNodeEnvironment === "production"
      ? requestedNodeEnvironment
      : "production";
  const childEnv: NodeJS.ProcessEnv = {
    GH_TOKEN: ghToken,
    NODE_ENV: nodeEnvironment,
  };
  const repository = env.GH_REPO?.trim() || env.GITHUB_REPOSITORY?.trim();
  if (repository) childEnv.GH_REPO = repository;

  // Keep only process-launch essentials. In particular, never copy OAuth or
  // API credentials from process.env into the gh child process.
  for (const key of [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "ComSpec",
    "PATHEXT",
    "HOME",
    "USERPROFILE",
    "TMPDIR",
    "TMP",
    "TEMP",
  ]) {
    const value = env[key] ?? process.env[key];
    if (value) childEnv[key] = value;
  }

  return childEnv;
}

/** Persist a secret without putting its value in the child process arguments. */
export function persistGitHubActionsSecret(
  secretName: string,
  secretValue: string,
  env: GitHubSecretEnvironment = process.env,
  execFile: typeof execFileSync = execFileSync,
  options: GitHubSecretPersistenceOptions = {},
): void {
  const ghToken = env.GH_TOKEN?.trim();
  if (!ghToken) {
    throw new Error(`GH_TOKEN is required to persist ${secretName} to GitHub Actions secrets.`);
  }
  if (!secretValue) {
    throw new Error(`A non-empty value is required to persist ${secretName}.`);
  }

  const args = ["secret", "set", secretName];
  if (options.environment) {
    args.push("--env", options.environment);
  }

  try {
    execFile("gh", args, {
      input: secretValue,
      stdio: ["pipe", "pipe", "pipe"],
      env: buildGitHubCliEnvironment(env, ghToken),
      timeout: 30_000,
      killSignal: "SIGTERM",
      maxBuffer: 1_048_576,
    });
  } catch (error) {
    const sanitizedError = formatErrorForLog(error)
      .split(secretValue)
      .join("[REDACTED:SECRET_VALUE]");
    throw new Error(
      `Failed to persist ${secretName} to GitHub Actions secrets: ${sanitizedError}`,
    );
  }

  const target = options.environment
    ? `the ${options.environment} GitHub Actions environment`
    : "GitHub Actions secrets";
  console.info(`  [secret-update] Persisted ${secretName} to ${target}.`);
}
