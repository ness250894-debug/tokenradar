import { describe, expect, it } from "vitest";

describe("sentry configuration", () => {
  it("skips initialization when no DSN is configured", async () => {
    const { createSentryInitOptions } = await import("../src/lib/sentry-config");

    expect(createSentryInitOptions("client", {})).toBeNull();
  });

  it("keeps paid Sentry data categories disabled by default", async () => {
    const { createSentryInitOptions } = await import("../src/lib/sentry-config");

    const options = createSentryInitOptions("client", {
      NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      NODE_ENV: "production",
    });

    expect(options).toMatchObject({
      dsn: "https://public@example.ingest.sentry.io/1",
      enabled: true,
      sampleRate: 1,
      tracesSampleRate: 0,
      profilesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      enableLogs: false,
      sendDefaultPii: false,
    });
  });
});
