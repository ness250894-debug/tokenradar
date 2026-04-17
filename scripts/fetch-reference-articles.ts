/**
 * Reference Article Scraper — Phase 2
 *
 * Fetches recent news and analysis for each token from crypto news RSS feeds.
 * Extracts key facts and analysis angles — never copies full text (copyright).
 *
 * Sources:
 * - CoinDesk RSS
 * - The Block RSS
 * - Decrypt RSS
 * - CoinTelegraph RSS
 *
 * Usage:
 *   npx tsx scripts/fetch-reference-articles.ts
 *   npx tsx scripts/fetch-reference-articles.ts --start 50 --end 100
 *
 * Cost: $0
 */

import * as fs from "fs";
import * as path from "path";
import { logError } from "../src/lib/reporter";
import { sleep } from "../src/lib/shared-utils";

const DATA_DIR = path.resolve(__dirname, "../data");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");
const REFERENCES_DIR = path.join(DATA_DIR, "references");

// ── RSS Feed Sources ───────────────────────────────────────────

const RSS_FEEDS = [
  {
    name: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml",
  },
  {
    name: "CoinTelegraph",
    url: "https://cointelegraph.com/rss",
  },
  {
    name: "Decrypt",
    url: "https://decrypt.co/feed",
  },
] as const;

// ── Types ──────────────────────────────────────────────────────

interface RssArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet: string;
}

export interface TokenReferences {
  tokenId: string;
  tokenName: string;
  articles: RssArticle[];
  fetchedAt: string;
}

// ── RSS Parsing ────────────────────────────────────────────────

/**
 * Lightweight XML RSS parser — extracts items from RSS/Atom feeds.
 * We intentionally avoid heavy XML parsing libraries; this simple
 * regex-based approach works for standard RSS 2.0 feeds.
 */
function parseRssItems(
  xml: string,
  sourceName: string
): RssArticle[] {
  const articles: RssArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const pubDate = extractTag(itemXml, "pubDate");
    const description = extractTag(itemXml, "description");

    if (title && link) {
      articles.push({
        title: cleanHtml(title),
        link: link.trim(),
        pubDate: pubDate || "",
        source: sourceName,
        snippet: cleanHtml(description || "").slice(0, 1000),
      });
    }
  }

  return articles;
}

/** Extract content of an XML tag. */
function extractTag(xml: string, tag: string): string | null {
  // Handle CDATA
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`,
    "i"
  );
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1];

  // Handle regular tags
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = regex.exec(xml);
  return match ? match[1] : null;
}

/** Strip HTML tags and decode basic entities. */
function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Fetching ───────────────────────────────────────────────────

/**
 * Fetch and parse an RSS feed.
 */
async function fetchRssFeed(
  feedUrl: string,
  sourceName: string
): Promise<RssArticle[]> {
  try {
    const response = await fetch(feedUrl, {
      headers: {
        "User-Agent": "TokenRadar/1.0 RSS Reader",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`  [${sourceName}] HTTP ${response.status}`);
      return [];
    }

    const xml = await response.text();
    return parseRssItems(xml, sourceName);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`  [${sourceName}] Error: ${msg}`);
    await logError("fetch-reference-articles", msg, false);
    return [];
  }
}

/**
 * Find articles mentioning a specific token.
 */
function findTokenArticles(
  allArticles: RssArticle[],
  tokenName: string,
  tokenSymbol: string,
  maxArticles: number = 5
): RssArticle[] {
  const nameLC = tokenName.toLowerCase();
  const symbolLC = tokenSymbol.toLowerCase();

  return allArticles
    .filter((article) => {
      const titleLC = article.title.toLowerCase();
      const snippetLC = article.snippet.toLowerCase();
      return (
        titleLC.includes(nameLC) ||
        titleLC.includes(symbolLC) ||
        snippetLC.includes(nameLC) ||
        snippetLC.includes(symbolLC)
      );
    })
    .slice(0, maxArticles);
}

/**
 * Optional: Fetch UGC Reddit posts to inject real human sentiment.
 * Runs only if REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are provided in .env.local
 * Free tier allows 100 requests per minute.
 */
async function fetchRedditOAuth(tokenName: string): Promise<RssArticle[]> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  try {
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
         "Authorization": `Basic ${authString}`,
         "Content-Type": "application/x-www-form-urlencoded",
         "User-Agent": "TokenRadar:v1.0.0 (by /u/tokenradar)"
      },
      body: "grant_type=client_credentials"
    });
    
    if (!tokenRes.ok) return [];
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    
    const url = `https://oauth.reddit.com/search?q=${encodeURIComponent(tokenName + ' crypto')}&sort=new&limit=3`;
    const response = await fetch(url, {
       headers: { 
         "Authorization": `Bearer ${accessToken}`,
         "User-Agent": "TokenRadar:v1.0.0 (by /u/tokenradar)" 
       },
       signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data?.children || []).map((post: any) => ({
      title: post.data.title,
      link: `https://reddit.com${post.data.permalink}`,
      pubDate: new Date(post.data.created_utc * 1000).toISOString(),
      source: "Reddit UGC",
      snippet: (post.data.selftext || "").substring(0, 300)
    }));
  } catch {
    return [];
  }
}



async function main() {
  const args = process.argv.slice(2);
  const startIdx = args.indexOf("--start");
  const endIdx = args.indexOf("--end");
  const startRank = startIdx !== -1 ? parseInt(args[startIdx + 1], 10) : 50;
  const endRank = endIdx !== -1 ? parseInt(args[endIdx + 1], 10) : 200;

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — Reference Article Scraper  ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  // Ensure output directory
  if (!fs.existsSync(REFERENCES_DIR)) {
    fs.mkdirSync(REFERENCES_DIR, { recursive: true });
  }

  // Load token list
  if (!fs.existsSync(TOKENS_FILE)) {
    console.error("  ✗ data/tokens.json not found. Run keyword-generator first.");
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8")) as {
    id: string;
    name: string;
    symbol: string;
    rank: number;
  }[];
  const filteredTokens = tokens.filter(
    (t) => t.rank >= startRank && t.rank <= endRank
  );
  console.log(`  Tokens: ${filteredTokens.length} (rank #${startRank}-#${endRank})`);
  console.log();

  // Step 1: Fetch all RSS feeds
  console.log("▶ Step 1: Fetching RSS feeds...");
  const allArticles: RssArticle[] = [];

  for (const feed of RSS_FEEDS) {
    process.stdout.write(`  [${feed.name}]...`);
    const articles = await fetchRssFeed(feed.url, feed.name);
    allArticles.push(...articles);
    console.log(` ${articles.length} articles`);
    await sleep(500);
  }

  console.log(`  ✓ Total articles fetched: ${allArticles.length}`);
  console.log();

  // Step 2: Match articles to tokens
  console.log("▶ Step 2: Matching articles to tokens...");
  let matched = 0;

  for (const token of filteredTokens) {
    const tokenArticles = findTokenArticles(
      allArticles,
      token.name,
      token.symbol
    );
    
    const redditPosts = await fetchRedditOAuth(token.name);
    if (redditPosts.length > 0) {
      await sleep(1000); // 1 req/sec max to safely stay under 100/min Reddit free tier limit
    }
    
    const finalArticles = [...redditPosts, ...tokenArticles].slice(0, 6); // Reddit prioritized at top

    const references: TokenReferences = {
      tokenId: token.id,
      tokenName: token.name,
      articles: finalArticles,
      fetchedAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(REFERENCES_DIR, `${token.id}.json`),
      JSON.stringify(references, null, 2)
    );

    if (tokenArticles.length > 0) {
      matched++;
      console.log(`  ✓ ${token.name}: ${tokenArticles.length} articles`);
    }
  }

  console.log();
  console.log("╔══════════════════════════════════════════╗");
  console.log("║        Reference Scrape Complete         ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  RSS Articles:  ${String(allArticles.length).padStart(5)}                ║`);
  console.log(`║  Tokens Total:  ${String(filteredTokens.length).padStart(5)}                ║`);
  console.log(`║  Tokens Match:  ${String(matched).padStart(5)}                ║`);
  console.log(`║  Output: data/references/                ║`);
  console.log("╚══════════════════════════════════════════╝");
}

main().catch(async (error) => {
  await logError("fetch-reference-articles", error);
  process.exit(1);
});
