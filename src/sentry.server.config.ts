import * as Sentry from "@sentry/nextjs";
import { createSentryInitOptions } from "./lib/sentry-config";

const sentryOptions = createSentryInitOptions("server");

if (sentryOptions) {
  Sentry.init(sentryOptions);
}
