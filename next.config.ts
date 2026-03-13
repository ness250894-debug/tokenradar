import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  /** Static export only for production builds (Cloudflare Pages). */
  ...(isProd && { output: "export" }),

  /** No trailing slashes — cleaner URLs. */
  trailingSlash: false,

  /** Disable image optimization for static export (Cloudflare handles CDN). */
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
