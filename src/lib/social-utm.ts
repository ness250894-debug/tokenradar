export interface SocialUtmContext {
  platform: string;
  date: string;
  archetypeKey: string;
  tokenId?: string | null;
  surface: string;
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
