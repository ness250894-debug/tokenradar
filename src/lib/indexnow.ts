import * as fs from "fs";
import * as path from "path";

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

export function extractXmlLocs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g), (match) => match[1].trim())
    .filter(Boolean);
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex\b/i.test(xml);
}

function localSitemapPathFromLoc(publicDir: string, loc: string): string | null {
  try {
    const url = new URL(loc);
    const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!relativePath || !relativePath.endsWith(".xml")) return null;
    const resolved = path.resolve(publicDir, relativePath);
    const publicRoot = path.resolve(publicDir);
    return resolved.startsWith(publicRoot) ? resolved : null;
  } catch {
    return null;
  }
}

function collectUrlsFromSitemapFile(filePath: string, publicDir: string, visited: Set<string>): string[] {
  const resolved = path.resolve(filePath);
  if (visited.has(resolved) || !fs.existsSync(resolved)) return [];
  visited.add(resolved);

  const xml = fs.readFileSync(resolved, "utf-8");
  const locs = extractXmlLocs(xml);
  if (!isSitemapIndex(xml)) return locs;

  const urls: string[] = [];
  for (const loc of locs) {
    const childPath = localSitemapPathFromLoc(publicDir, loc);
    if (childPath && fs.existsSync(childPath)) {
      urls.push(...collectUrlsFromSitemapFile(childPath, publicDir, visited));
    }
  }
  return urls;
}

export function collectIndexNowUrlsFromPublicDir(
  publicDir = path.resolve(process.cwd(), "public"),
  sitemapFilename = "sitemap.xml",
): string[] {
  const sitemapPath = path.join(publicDir, sitemapFilename);
  const urls = collectUrlsFromSitemapFile(sitemapPath, publicDir, new Set<string>());
  return Array.from(new Set(urls));
}

export function chunkUrls(urls: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < urls.length; index += chunkSize) {
    chunks.push(urls.slice(index, index + chunkSize));
  }
  return chunks;
}

export function buildIndexNowPayload(siteUrl: string, key: string, urlList: string[]): IndexNowPayload {
  const host = new URL(siteUrl).hostname;
  return {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList,
  };
}
