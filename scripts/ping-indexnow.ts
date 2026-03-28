/**
 * Ping IndexNow API with the URLs from our generated sitemap.
 */
import * as fs from "fs";
import * as path from "path";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const SITEMAP_PATH = path.join(PUBLIC_DIR, "sitemap.xml");

// Must match the filename in public/ directory
const INDEXNOW_KEY = "c7a4b0d8e2f143a9b5c2d8f1e4a7b0d8";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";

async function pingIndexNow() {
  if (!fs.existsSync(SITEMAP_PATH)) {
    console.error("sitemap.xml not found. Cannot ping IndexNow.");
    process.exit(1);
  }

  const sitemapXml = fs.readFileSync(SITEMAP_PATH, "utf-8");
  
  // Quick regex to extract <loc> URLs
  const urls: string[] = [];
  const regex = /<loc>(.*?)<\/loc>/g;
  let match;
  while ((match = regex.exec(sitemapXml)) !== null) {
    if (match[1]) {
      urls.push(match[1]);
    }
  }

  console.log(`[IndexNow] Found ${urls.length} URLs in sitemap.`);

  if (urls.length === 0) {
    console.log("[IndexNow] No URLs to ping.");
    return;
  }

  // We only post up to 10k per request (IndexNow limit), chunking to be safe
  const chunkSize = 10000;
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunkUrls = urls.slice(i, i + chunkSize);
    const hostUrl = new URL(SITE_URL).hostname;

    const payload = {
      host: hostUrl,
      key: INDEXNOW_KEY,
      keyLocation: `https://${hostUrl}/${INDEXNOW_KEY}.txt`,
      urlList: chunkUrls
    };

    try {
      const response = await fetch("https://api.indexnow.org/IndexNow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(payload)
      });

      if (response.ok || response.status === 200 || response.status === 202) {
        console.log(`[IndexNow] Successfully pinged with ${chunkUrls.length} URLs. Response: ${response.status}`);
      } else {
        console.error(`[IndexNow] Failed to ping. Status: ${response.status}`);
        console.error(await response.text());
      }
    } catch (error) {
      console.error("[IndexNow] Error pinging IndexNow:", error);
    }
  }
}

pingIndexNow().catch(console.error);
