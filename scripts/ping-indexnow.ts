/**
 * Ping IndexNow API with page URLs from the generated sitemap chunks.
 */
import * as path from "path";
import { pathToFileURL } from "url";
import {
  buildIndexNowPayload,
  chunkUrls,
  collectIndexNowUrlsFromPublicDir,
} from "../src/lib/indexnow";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";
const INDEXNOW_CHUNK_SIZE = 10_000;

export async function pingIndexNow(): Promise<void> {
  if (!INDEXNOW_KEY) {
    throw new Error("[IndexNow] Missing INDEXNOW_KEY environment variable.");
  }

  const urls = collectIndexNowUrlsFromPublicDir(PUBLIC_DIR);
  console.log(`[IndexNow] Found ${urls.length} page URLs in generated sitemap chunks.`);

  if (urls.length === 0) {
    console.log("[IndexNow] No URLs to ping.");
    return;
  }

  for (const urlList of chunkUrls(urls, INDEXNOW_CHUNK_SIZE)) {
    const payload = buildIndexNowPayload(SITE_URL, INDEXNOW_KEY, urlList);
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok || response.status === 200 || response.status === 202) {
      console.log(`[IndexNow] Successfully pinged with ${urlList.length} URLs. Response: ${response.status}`);
      continue;
    }

    throw new Error(`[IndexNow] Failed to ping. Status: ${response.status}. ${await response.text()}`);
  }
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href;
}

if (isDirectExecution()) {
  pingIndexNow().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
