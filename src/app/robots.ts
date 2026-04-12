import { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
      {
        userAgent: ["GPTBot", "ChatGPT-User", "Claude-Web", "ClaudeBot", "PerplexityBot", "CCBot", "Google-Extended"],
        allow: "/",
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
