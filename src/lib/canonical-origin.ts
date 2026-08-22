export const PRODUCTION_SITE_ORIGIN = "https://tokenradar.co";

export function isProductionCanonicalSiteUrl(value: string): boolean {
  return value === PRODUCTION_SITE_ORIGIN || value === `${PRODUCTION_SITE_ORIGIN}/`;
}
