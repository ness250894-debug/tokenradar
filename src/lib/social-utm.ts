export interface SocialUtmContext {
  platform: string;
  date: string;
  archetypeKey: string;
  tokenId?: string | null;
  surface: string;
}

export interface SocialUtmAttribution {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
}

function slugPart(value: string | undefined | null): string {
  return (value || "general")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "general";
}

function compactDate(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, 8) || new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

export function buildSocialUtmUrl(baseUrl: string, context: SocialUtmContext): string {
  const url = new URL(baseUrl);
  const content = [
    compactDate(context.date),
    slugPart(context.platform),
    slugPart(context.surface),
    slugPart(context.archetypeKey),
    slugPart(context.tokenId),
  ].join("-");

  url.searchParams.set("utm_source", slugPart(context.platform));
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "social_rotation");
  url.searchParams.set("utm_content", content);

  return url.toString();
}

export function readSocialUtmAttribution(value: string | undefined | null): SocialUtmAttribution {
  if (!value?.trim()) return {};
  try {
    const url = new URL(value, "https://tokenradar.co");
    const parameter = (name: string): string | undefined => url.searchParams.get(name)?.trim() || undefined;
    return {
      source: parameter("utm_source"),
      medium: parameter("utm_medium"),
      campaign: parameter("utm_campaign"),
      content: parameter("utm_content"),
    };
  } catch {
    return {};
  }
}
