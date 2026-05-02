import * as fs from 'fs';
import * as path from 'path';

import { generateMoversImage } from '../src/lib/movers-generator';
import { renderOgImage } from '../src/lib/og-renderer';
import { loadCandidateTokens } from './lib/token-selection';
import { loadEnv } from '../src/lib/utils';

loadEnv();

const DATA_DIR = path.join(process.cwd(), "data");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");
const METRICS_DIR = path.join(DATA_DIR, "metrics");
const PUBLIC_DIR = path.join(process.cwd(), "public");
const OG_DIR = path.join(PUBLIC_DIR, "og", "token");

// Ensure og directory exists
if (!fs.existsSync(OG_DIR)) {
  fs.mkdirSync(OG_DIR, { recursive: true });
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
  }
  return fallback;
}

async function generateOGImages() {
  console.info("Starting static OG image generation...");
  
  if (!fs.existsSync(TOKENS_DIR)) {
    console.info("No tokens dir found.");
    return;
  }
  
  const tokenFiles = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith(".json"));
  
  const force = process.argv.includes('--force');
  
  for (const file of tokenFiles) {
    const tokenId = file.replace('.json', '');
    const outputPath = path.join(OG_DIR, `${tokenId}.png`);
    
    if (!force && fs.existsSync(outputPath)) {
      continue;
    }

    const tokenData = safeReadJson<{ symbol: string; name?: string; id: string; market?: { price?: number; priceChange24h?: number } } | null>(path.join(TOKENS_DIR, file), null);
    const metricsData = safeReadJson<{ riskScore?: number } | null>(path.join(METRICS_DIR, file), null);
    
    if (!tokenData) continue;
    
    const symbol = (tokenData.symbol || tokenId.split('-')[0]).toUpperCase();
    const name = tokenData.name || tokenId;
    const riskScore = metricsData?.riskScore || 5;
    const price = tokenData.market?.price || 0;
    const change = tokenData.market?.priceChange24h || 0;

    try {
      const pngBuffer = await renderOgImage({
        name,
        symbol,
        price,
        change,
        risk: riskScore
      });
      
      fs.writeFileSync(outputPath, pngBuffer);
      console.info(`Generated OG image for ${tokenId}`);
    } catch (e) {
      console.error(`Failed to generate OG image for ${tokenId}:`, e);
    }
  }

  // --- Daily Movers Section ---
  console.info("Generating Daily Movers static image using live API data...");
  try {
    // Re-use exactly the same logic as the Telegram bot to ensure perfect sync
    const { candidates } = await loadCandidateTokens(DATA_DIR, 1, 500);
    const MAX_CHANGE_THRESHOLD = 500;
    
    const movers = candidates
      .filter(t => t.market.priceChange24h > 0 && t.market.priceChange24h <= MAX_CHANGE_THRESHOLD && t.market.price > 0)
      .sort((a, b) => b.market.priceChange24h - a.market.priceChange24h)
      .slice(0, 5)
      .map(t => ({
        id: t.id,
        symbol: t.symbol,
        name: t.name,
        price: t.market.price,
        change24h: t.market.priceChange24h
      }));

    if (movers.length > 0) {
      const moversBuffer = await generateMoversImage(movers);
      const moversPath = path.join(PUBLIC_DIR, "og", "movers.png");
      fs.writeFileSync(moversPath, moversBuffer);
      console.info("✅ Generated static movers image at public/og/movers.png perfectly synced with live data");
    }
  } catch (e) {
    console.error("❌ Failed to generate static movers image:", e);
  }
  
  console.info("Done.");
}

generateOGImages().catch(console.error);
