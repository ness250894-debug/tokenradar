import { ImageResponse } from 'next/og';
import { getTokenDetail, getTokenMetrics } from '@/lib/content-loader';
import { getPilotTokenIds } from '@/lib/token-technical-data';
import { getTokenIconUrl } from '@/lib/formatters';

// Image metadata
export const alt = 'Crypto Comparison: TokenRadar';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

/**
 * Generate static paths for TOP 50 pairings (Pairwise with the #1 token).
 * This covers the most viral shares (e.g. BTC vs ETH, BTC vs SOL).
 */
export async function generateStaticParams() {
  const ids = getPilotTokenIds();
  const top1 = ids[0]; // Usually Bitcoin
  
  // Generate BTC vs Top 50
  return ids.slice(1, 51).map((id) => ({
    slug: `${top1}-vs-${id}`,
  }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parts = slug.split('-vs-');
  if (parts.length !== 2) return new ImageResponse(<div>Invalid Pairing</div>);

  const tokenA = getTokenDetail(parts[0]);
  const tokenB = getTokenDetail(parts[1]);
  const metricsA = getTokenMetrics(parts[0]);
  const metricsB = getTokenMetrics(parts[1]);

  if (!tokenA || !tokenB) return new ImageResponse(<div>Data Missing</div>);

  const scoreA = metricsA?.riskScore || 5;
  const scoreB = metricsB?.riskScore || 5;

  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0a0a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* VS Label - Placed after background but before content for stacking */}
        <div style={{ 
          position: 'absolute', 
          background: '#111', 
          border: '2px solid rgba(255,255,255,0.1)', 
          borderRadius: '100px', 
          width: 140, 
          height: 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 40px rgba(0,0,0,0.5)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)'
        }}>
          <span style={{ fontSize: 60, fontWeight: 900, background: 'linear-gradient(white, #666)', backgroundClip: 'text', color: 'transparent' }}>VS</span>
        </div>

        <div style={{ position: 'absolute', left: 0, top: 0, width: '50%', height: '100%', background: 'linear-gradient(to right, rgba(16, 185, 129, 0.05), transparent)' }} />
        <div style={{ position: 'absolute', right: 0, top: 0, width: '50%', height: '100%', background: 'linear-gradient(to left, rgba(59, 130, 246, 0.05), transparent)' }} />

        <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', padding: '0 80px' }}>
          
          {/* Side A: Pros/Risk */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '20px' }}>
            <img src={getTokenIconUrl(tokenA.symbol, tokenA.id)} width={140} height={140} style={{ borderRadius: '20px', border: '3px solid #10b981' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 50, fontWeight: 'bold', color: 'white' }}>{tokenA.symbol}</span>
              <span style={{ fontSize: 28, color: '#10b981', fontWeight: 700 }}>Risk: {scoreA.toFixed(1)}/10</span>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '12px 24px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#10b981', fontSize: 20, fontWeight: 600 }}>
              {scoreA < 4 ? 'SAFE CHOICE' : scoreA < 7 ? 'MODERATE' : 'SPECULATIVE'}
            </div>
          </div>

          <div style={{ width: 140 }} /> {/* Spacer for VS label */}

          {/* Side B: Pros/Risk */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '20px' }}>
            <img src={getTokenIconUrl(tokenB.symbol, tokenB.id)} width={140} height={140} style={{ borderRadius: '20px', border: '3px solid #3b82f6' }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: 50, fontWeight: 'bold', color: 'white' }}>{tokenB.symbol}</span>
              <span style={{ fontSize: 28, color: '#3b82f6', fontWeight: 700 }}>Risk: {scoreB.toFixed(1)}/10</span>
            </div>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px 24px', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)', color: '#3b82f6', fontSize: 20, fontWeight: 600 }}>
              {scoreB < 4 ? 'SAFE CHOICE' : scoreB < 7 ? 'MODERATE' : 'SPECULATIVE'}
            </div>
          </div>
        </div>

        {/* Branding Footer */}
        <div style={{ position: 'absolute', bottom: 40, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 24, fontWeight: 500 }}>
            Side-by-Side Analysis provided by 
          </span>
          <span style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>
            TOKEN<span style={{ color: '#10b981' }}>RADAR</span>
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
