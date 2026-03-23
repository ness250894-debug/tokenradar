import * as fs from "fs";
import * as path from "path";
import Parser from "rss-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const DATA_DIR = path.resolve(__dirname, "../data");
const TGE_FILE = path.join(DATA_DIR, "upcoming-tges.json");

const RSS_FEEDS = [
  "https://cointelegraph.com/rss",                     // General Market Context
  "https://airdropalert.com/feed/",                    // Airdrop Alert (Direct Feed)
  "https://cryptopanic.com/news/ico/rss/"              // CryptoPanic (ICO/TGE Tag)
];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY || "" });

interface UpcomingTge {
  id: string;
  name: string;
  symbol: string;
  category: string;
  expectedTge: string;
  narrativeStrength: number;
  dataSource: string;
  discoveredAt: string;
}

const parser = new Parser();

async function analyzeNewsWithAI(newsItems: any[]): Promise<UpcomingTge[]> {
  const newsContext = newsItems.map(item => `Title: ${item.title}\nSnippet: ${item.contentSnippet || item.content}\nSource: ${item.link}`).join("\n---\n");

  const prompt = `You are a crypto research analyst. Analyze these news items and identify any upcoming Token Generation Events (TGE), ICOs, or major token launches for HIGH QUALITY, VC-backed, or highly anticipated projects.
  
  Ignore low-quality degen/meme tokens.
  
  Return a JSON array of objects with:
  {
    "id": "kebab-case-id",
    "name": "Project Name",
    "symbol": "SYMBOL",
    "category": "L1/L2/DeFi/AI/etc",
    "expectedTge": "Rough date (e.g., Q2 2026)",
    "narrativeStrength": 1-100 (score based on hype/investors),
    "dataSource": "Link to news"
  }
  
  If no high-quality TGEs found, return [].
  
  News Items:
  ${newsContext}`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch (e) {
    console.error("AI Analysis failed:", e);
    return [];
  }
}

async function checkGraduation(tge: UpcomingTge): Promise<boolean> {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${tge.id}`);
    if (res.status === 200) {
      const data = await res.json();
      return !!data.market_data?.current_price?.usd;
    }
  } catch (e) {
    console.error(`Check graduation failed for ${tge.id}:`, e);
  }
  return false;
}

async function main() {
  console.log("🔍 Discovering upcoming TGEs...");
  
  let allNews: any[] = [];
  for (const url of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(url);
      allNews = [...allNews, ...feed.items];
    } catch (e) {
      console.error(`Failed to parse RSS feed ${url}:`, e);
    }
  }

  const discovered = await analyzeNewsWithAI(allNews);
  console.log(`✨ AI identified ${discovered.length} potential TGEs.`);

  let existing: UpcomingTge[] = [];
  if (fs.existsSync(TGE_FILE)) {
    existing = JSON.parse(fs.readFileSync(TGE_FILE, "utf-8"));
  }

  const combined = [...existing];
  const graduating: string[] = [];

  for (const item of discovered) {
    if (!combined.find(e => e.id === item.id)) {
      combined.push({ ...item, discoveredAt: new Date().toISOString() });
      console.log(`➕ Added new TGE: ${item.name}`);
    }
  }

  // Remove graduated tokens
  const active: UpcomingTge[] = [];
  for (const tge of combined) {
    const isGraduated = await checkGraduation(tge);
    if (isGraduated) {
      console.log(`🎓 ${tge.name} has graduated (trading on CoinGecko).`);
      graduating.push(tge.name);
    } else {
      active.push(tge);
    }
  }

  fs.writeFileSync(TGE_FILE, JSON.stringify(active, null, 2));
  console.log(`✅ Saved ${active.length} upcoming TGEs.`);
}

main().catch(console.error);
