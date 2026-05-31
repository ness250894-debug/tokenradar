import * as Sentry from "@sentry/nextjs";
import { createSentryInitOptions } from "@/lib/sentry-config";

const sentryOptions = createSentryInitOptions("client");

if (sentryOptions) {
  Sentry.init(sentryOptions);
}
