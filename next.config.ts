import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  /** Disable image optimization for static export (Cloudflare handles CDN). */
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
