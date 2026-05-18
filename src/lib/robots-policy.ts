import { getSiteUrl } from "./seo";

export const AI_CRAWLER_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "Claude-Web",
  "ClaudeBot",
  "PerplexityBot",
  "CCBot",
  "Google-Extended",
] as const;

export interface RobotsRule {
  userAgent: string | string[];
  allow: string;
}

export interface RobotsPolicy {
  rules: RobotsRule[];
  sitemap: string;
}

export function buildRobotsPolicy(siteUrl = getSiteUrl()): RobotsPolicy {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
      {
        userAgent: [...AI_CRAWLER_USER_AGENTS],
        allow: "/",
      },
    ],
    sitemap: `${siteUrl.replace(/\/+$/, "")}/sitemap.xml`,
  };
}

export function buildRobotsText(siteUrl = getSiteUrl()): string {
  const policy = buildRobotsPolicy(siteUrl);
  const groups = policy.rules.map((rule) => {
    const agents = Array.isArray(rule.userAgent) ? rule.userAgent : [rule.userAgent];
    return [
      ...agents.map((agent) => `User-agent: ${agent}`),
      `Allow: ${rule.allow}`,
    ].join("\n");
  });

  return `${groups.join("\n\n")}\n\nSitemap: ${policy.sitemap}\n`;
}
