import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

/**
 * OpenNext configuration for TokenRadar on Cloudflare Pages.
 * Uses Workers KV for page caching and D1 for revalidation tags.
 */
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  tagCache: d1NextTagCache,
});
