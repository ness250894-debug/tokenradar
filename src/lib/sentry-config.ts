import type { ErrorEvent, EventHint } from "@sentry/core";
import type * as Sentry from "@sentry/nextjs";

export type SentryRuntime = "client" | "server" | "edge";

type SentryInitOptions = Parameters<typeof Sentry.init>[0];
type Env = Record<string, string | undefined>;

const IGNORED_BROWSER_ERRORS = [
  "ResizeObserver loop completed with undelivered notifications.",
  "ResizeObserver loop limit exceeded",
  "Script error.",
  "NetworkError when attempting to fetch resource.",
  "Failed to fetch",
  "Load failed",
];

const DENIED_BROWSER_URLS = [
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
  /^webkit-masked-url:\/\//i,
  /extensions\//i,
];

function readEnv(env: Env, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }

  return undefined;
}

function readBooleanEnv(env: Env, fallback: boolean, ...names: string[]): boolean {
  const value = readEnv(env, ...names);
  if (!value) return fallback;

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readSampleRate(env: Env, fallback: number, ...names: string[]): number {
  const value = readEnv(env, ...names);
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(1, Math.max(0, parsed));
}

function sanitizeEnvironment(value: string | undefined): string {
  const environment = (value || "production")
    .trim()
    .replace(/[\s/]+/g, "-")
    .slice(0, 64);

  if (!environment || environment.toLowerCase() === "none") {
    return "production";
  }

  return environment;
}

function getSentryDsn(env: Env): string | undefined {
  return readEnv(env, "NEXT_PUBLIC_SENTRY_DSN", "SENTRY_DSN");
}

function getSentryRelease(env: Env): string | undefined {
  return readEnv(env, "NEXT_PUBLIC_SENTRY_RELEASE", "SENTRY_RELEASE", "CF_PAGES_COMMIT_SHA");
}

function shouldDropClientEvent(event: ErrorEvent): boolean {
  const frames = event.exception?.values?.flatMap((value) => value.stacktrace?.frames || []) || [];

  return frames.some((frame) => {
    const filename = frame.filename || "";
    return DENIED_BROWSER_URLS.some((pattern) => pattern.test(filename));
  });
}

export function createSentryInitOptions(
  runtime: SentryRuntime,
  env: Env = process.env,
): SentryInitOptions | null {
  const dsn = getSentryDsn(env);
  if (!dsn) return null;

  const release = getSentryRelease(env);
  const nodeEnv = readEnv(env, "NODE_ENV");

  return {
    dsn,
    enabled: readBooleanEnv(
      env,
      nodeEnv === "production",
      "NEXT_PUBLIC_SENTRY_ENABLED",
      "SENTRY_ENABLED",
    ),
    environment: sanitizeEnvironment(
      readEnv(env, "NEXT_PUBLIC_SENTRY_ENVIRONMENT", "SENTRY_ENVIRONMENT", "CF_PAGES_BRANCH", "NODE_ENV"),
    ),
    ...(release ? { release } : {}),
    sendDefaultPii: false,
    sendClientReports: false,
    attachStacktrace: true,
    debug: readBooleanEnv(env, false, "NEXT_PUBLIC_SENTRY_DEBUG", "SENTRY_DEBUG"),
    sampleRate: readSampleRate(
      env,
      1,
      "NEXT_PUBLIC_SENTRY_ERROR_SAMPLE_RATE",
      "SENTRY_ERROR_SAMPLE_RATE",
    ),
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enableLogs: false,
    ignoreErrors: IGNORED_BROWSER_ERRORS,
    denyUrls: DENIED_BROWSER_URLS,
    beforeSend: (event: ErrorEvent, _hint: EventHint) => {
      if (runtime === "client" && shouldDropClientEvent(event)) {
        return null;
      }

      return event;
    },
  };
}
