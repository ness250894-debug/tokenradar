import fs from 'fs';
import path from 'path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

import { getTokenIconUrl } from '../src/lib/formatters';
import { generateMoversImage } from '../src/lib/movers-generator';

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

let interFontBuffer: ArrayBuffer | null = null;

async function getFont() {
  if (!interFontBuffer) {
    const res = await fetch('https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Medium.ttf');
    interFontBuffer = await res.arrayBuffer();
  }
  return interFontBuffer;
}

async function generateOGImages() {
  console.info("Starting static OG image generation...");
  const fontData = await getFont();
  
  if (!fs.existsSync(TOKENS_DIR)) {
    console.info("No tokens dir found.");
    return;
  }
  
  const tokenFiles = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith(".json"));
  
  for (const file of tokenFiles) {
    const tokenId = file.replace('.json', '');
    const tokenData = safeReadJson<{ symbol: string; name?: string; id: string; categories?: string[] } | null>(path.join(TOKENS_DIR, file), null);
    const metricsData = safeReadJson<{ riskScore?: number } | null>(path.join(METRICS_DIR, file), null);
    
    if (!tokenData) continue;
    
    const symbol = (tokenData.symbol || tokenId.split('-')[0]).toUpperCase();
    const name = tokenData.name || tokenId;
    const riskScore = metricsData?.riskScore || 5;
    const iconUrl = getTokenIconUrl(tokenData.symbol, tokenData.id);

    const riskColor = riskScore < 4 ? '#10b981' : riskScore < 7 ? '#f59e0b' : '#ef4444';
    const riskLabel = riskScore < 4 ? 'LOW RISK' : riskScore < 7 ? 'MODERATE' : 'HIGH RISK';
    const category = tokenData.categories?.[0] || 'CRYPTO ASSET';

    const element = (
      <div
        style={{
          background: '#0a0a0a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"Inter"',
          position: 'relative',
          padding: '80px',
        }}
      >
        <div 
          style={{
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.03) 0%, transparent 70%)',
          }}
        />

        <div style={{ position: 'absolute', top: 40, right: 60, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 32, height: 32, background: '#10b981', borderRadius: '8px' }} />
          <span style={{ color: 'white', fontSize: 32, fontWeight: 'bold', letterSpacing: '-0.02em' }}>
            TOKEN<span style={{ color: '#10b981' }}>RADAR</span>
          </span>
        </div>

        <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '60px' }}>
          <div style={{ display: 'flex', borderRadius: '40px', overflow: 'hidden', border: '4px solid rgba(255,255,255,0.1)', background: '#111', width: 240, height: 240, alignItems: 'center', justifyContent: 'center' }}>
            {iconUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={iconUrl}
                alt={name}
                width={240}
                height={240}
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <div style={{ display: 'flex', color: 'white', fontSize: 120, fontWeight: 'bold' }}>
                {symbol.charAt(0)}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px', marginBottom: '10px' }}>
              <span style={{ fontSize: 80, fontWeight: 'bold', color: 'white' }}>{symbol}</span>
              <span style={{ fontSize: 40, color: 'rgba(255,255,255,0.5)' }}>{name}</span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px' }}>
              <span style={{ 
                fontSize: 28, 
                fontWeight: 600, 
                color: '#10b981',
                background: 'rgba(16, 185, 129, 0.1)',
                padding: '12px 24px',
                borderRadius: '12px',
                letterSpacing: '0.05em'
              }}>
                ON-CHAIN INTELLIGENCE
              </span>
              <span style={{ 
                fontSize: 24, 
                padding: '12px 24px', 
                borderRadius: '12px', 
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'rgba(255, 255, 255, 0.8)',
                fontWeight: 'bold',
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}>
                {category}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '30px', background: 'rgba(255,255,255,0.03)', padding: '30px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 20, fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase' }}>Proprietary Risk Score</span>
                <span style={{ color: riskColor, fontSize: 48, fontWeight: 'bold' }}>{riskScore.toFixed(1)}/10</span>
              </div>
              <div style={{ width: 2, height: 60, background: 'rgba(255,255,255,0.1)' }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 20, fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase' }}>Security Rating</span>
                <span style={{ color: 'white', fontSize: 32, fontWeight: 'bold' }}>{riskLabel}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: 40, left: 80, display: 'flex', color: 'rgba(255,255,255,0.3)', fontSize: 24, fontWeight: 500 }}>
          Unbiased Data-Driven Research & Market Analysis
        </div>
      </div>
    );

    try {
      const svg = await satori(element, {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'Inter',
            data: fontData,
            weight: 600,
            style: 'normal',
          },
        ],
      });

      const resvg = new Resvg(svg, {
        background: '#0a0a0a',
        fitTo: {
          mode: 'width',
          value: 1200,
        },
      });

      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();
      
      fs.writeFileSync(path.join(OG_DIR, `${tokenId}.png`), pngBuffer);
      console.info(`Generated OG image for ${tokenId}`);
    } catch (e) {
      console.error(`Failed to generate OG image for ${tokenId}:`, e);
    }
  }

  // --- Daily Movers Section ---
  console.info("Generating Daily Movers static image...");
  const tokensDataPath = path.join(DATA_DIR, "tokens.json");
  if (fs.existsSync(tokensDataPath)) {
    const tokens = safeReadJson<any[]>(tokensDataPath, []);
    const movers = [...tokens]
      .filter(t => t.market?.priceChange24h !== undefined)
      .sort((a, b) => (b.market?.priceChange24h || 0) - (a.market?.priceChange24h || 0))
      .slice(0, 5)
      .map(t => ({
        id: t.id,
        symbol: t.symbol,
        name: t.name,
        price: t.market.price || 0,
        change24h: t.market.priceChange24h || 0
      }));

    if (movers.length > 0) {
      try {
        const moversBuffer = await generateMoversImage(movers);
        const moversPath = path.join(PUBLIC_DIR, "og", "movers.png");
        fs.writeFileSync(moversPath, moversBuffer);
        console.info("✅ Generated static movers image at public/og/movers.png");
      } catch (e) {
        console.error("❌ Failed to generate static movers image:", e);
      }
    }
  }
  
  console.info("Done.");
}

generateOGImages().catch(console.error);
