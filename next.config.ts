import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Static export for Cloudflare Pages deployment. */
  output: "export",

  /** No trailing slashes — cleaner URLs. */
  trailingSlash: false,

  /** Disable image optimization for static export (Cloudflare handles CDN). */
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
