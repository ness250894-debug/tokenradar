import { createSentryInitOptions } from "@/lib/sentry-config";

const sentryOptions = createSentryInitOptions("client");
const SENTRY_LOAD_DELAY_MS = 5000;
const MAX_BUFFERED_ERRORS = 5;

if (sentryOptions) {
  const bufferedErrors: unknown[] = [];
  const bufferError = (event: ErrorEvent) => {
    if (bufferedErrors.length < MAX_BUFFERED_ERRORS) {
      bufferedErrors.push(event.error || event.message);
    }
  };
  const bufferRejection = (event: PromiseRejectionEvent) => {
    if (bufferedErrors.length < MAX_BUFFERED_ERRORS) {
      bufferedErrors.push(event.reason);
    }
  };

  window.addEventListener("error", bufferError);
  window.addEventListener("unhandledrejection", bufferRejection);

  const initializeSentry = () => {
    window.setTimeout(() => {
      void import("@sentry/nextjs").then((Sentry) => {
        Sentry.init(sentryOptions);
        window.removeEventListener("error", bufferError);
        window.removeEventListener("unhandledrejection", bufferRejection);

        for (const error of bufferedErrors) {
          Sentry.captureException(error);
        }
      });
    }, SENTRY_LOAD_DELAY_MS);
  };

  if (document.readyState === "complete") {
    initializeSentry();
  } else {
    window.addEventListener("load", initializeSentry, { once: true });
  }
}
