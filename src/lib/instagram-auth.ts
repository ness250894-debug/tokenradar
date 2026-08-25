/** Supported Instagram Graph API authentication families. */
export type InstagramAuthMode = "facebook_login" | "instagram_login";

export type InstagramAuthEnvironment = Record<string, string | undefined>;

export const META_GRAPH_API_VERSION = "v25.0";

/**
 * Resolve the configured Instagram authentication family.
 *
 * Token formats are intentionally treated as opaque. A Facebook/Page token and
 * an Instagram Login token must never be routed by guessing at their prefix.
 * The legacy default keeps existing deployments working until the token,
 * account ID, and repository variable are switched together.
 */
export function resolveInstagramAuthMode(
  env: InstagramAuthEnvironment = process.env,
): InstagramAuthMode {
  const configured = env.IG_AUTH_MODE?.trim().toLowerCase();
  if (!configured) return "facebook_login";
  if (configured === "facebook_login" || configured === "instagram_login") {
    return configured;
  }

  throw new Error(
    `Invalid IG_AUTH_MODE "${configured}". Expected "facebook_login" or "instagram_login".`,
  );
}
/** Graph host used for Instagram publishing, validation, and metrics. */
export function getInstagramGraphBaseUrl(
  env: InstagramAuthEnvironment = process.env,
): string {
  return resolveInstagramAuthMode(env) === "instagram_login"
    ? `https://graph.instagram.com/${META_GRAPH_API_VERSION}`
    : `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
}
