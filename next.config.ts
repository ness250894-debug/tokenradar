import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const hasSentrySourceMapUploadConfig = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT,
);

const nextConfig: NextConfig = {
  /** Generate a fully static site; no server runtime needed. */
  output: "export",
  /** Disable image optimization for static export (Cloudflare handles CDN). */
  images: {
    unoptimized: true,
  },
  turbopack: {
    resolveAlias: {
      "@ast-grep/napi": "./src/lib/mocks/ast-grep-napi.js",
      jsdom: "./src/lib/mocks/ast-grep-napi.js",
    },
  },
  experimental: {
    prefetchInlining: true,
  },
};

const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: {
    disable: !hasSentrySourceMapUploadConfig,
  },
  release: {
    create: hasSentrySourceMapUploadConfig,
    finalize: hasSentrySourceMapUploadConfig,
  },
  widenClientFileUpload: false,
  routeManifestInjection: false,
  suppressOnRouterTransitionStartWarning: true,
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeTracing: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
  webpack: {
    automaticVercelMonitors: false,
    treeshake: {
      removeDebugLogging: true,
      removeTracing: true,
      excludeReplayIframe: true,
      excludeReplayShadowDOM: true,
      excludeReplayCompressionWorker: true,
    },
  },
} as const;

export default hasSentrySourceMapUploadConfig
  ? withSentryConfig(nextConfig, sentryBuildOptions)
  : nextConfig;
