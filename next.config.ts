import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  /** Disable image optimization for static export (Cloudflare handles CDN). */
  images: {
    unoptimized: true,
  },
  turbopack: {
    resolveAlias: {
      "@ast-grep/napi": "./src/lib/mocks/ast-grep-napi.js",
      jsdom: "./src/lib/mocks/ast-grep-napi.js",
      "isomorphic-dompurify": "./src/lib/mocks/dompurify-mock.js",
    },
  },
};

export default nextConfig;
