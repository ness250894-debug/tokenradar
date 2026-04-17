import { ImageResponse } from 'next/og';
import { getTokenDetail, getTokenMetrics, getTokenIds } from '@/lib/content-loader';
import { formatPrice, getTokenIconUrl } from '@/lib/formatters';

// Image metadata
export const alt = 'TokenRadar Analysis';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

/**
 * Generate static OG images for Top 50 tokens at build time.
 */
export async function generateStaticParams() {
  const ids = await getTokenIds();
  return ids.slice(0, 50).map((id) => ({
    token: id,
  }));
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token: tokenId } = await params;
  const token = await getTokenDetail(tokenId);
  const metrics = await getTokenMetrics(tokenId);
  
  if (!token) return new ImageResponse(<div>Token Not Found</div>);

  const riskScore = metrics?.riskScore || 5;
  const riskColor = riskScore < 4 ? '#10b981' : riskScore < 7 ? '#f59e0b' : '#ef4444';
  const riskLabel = riskScore < 4 ? 'LOW RISK' : riskScore < 7 ? 'MODERATE' : 'HIGH RISK';

  // --- Resilience: Verify if the icon exists ---
  const iconUrl = getTokenIconUrl(token.symbol, tokenId);
  let hasImage = false;
  try {
    const imgRes = await fetch(iconUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    hasImage = imgRes.ok;
  } catch (e) {
    hasImage = false;
  }

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
          padding: '80px',
        }}
      >
        {/* Decorative Radar Sweep */}
        <div 
          style={{
            position: 'absolute',
            top: '-50%',
            left: '-50%',
            width: '200%',
            height: '200%',
            background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.05) 0%, transparent 70%)',
          }}
        />

        {/* Branding Corner */}
        <div style={{ position: 'absolute', top: 40, right: 60, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 32, height: 32, background: '#10b981', borderRadius: '8px' }} />
          <span style={{ color: 'white', fontSize: 32, fontWeight: 'bold', letterSpacing: '-0.02em' }}>
            TOKEN<span style={{ color: '#10b981' }}>RADAR</span>
          </span>
        </div>

        {/* Main Content Area */}
        <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '60px' }}>
          {/* Token Icon or Fallback */}
          <div style={{ display: 'flex', borderRadius: '40px', overflow: 'hidden', border: '4px solid rgba(255,255,255,0.1)', background: '#111', width: 240, height: 240, alignItems: 'center', justifyContent: 'center' }}>
            {hasImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={iconUrl}
                alt={token.name}
                width={240}
                height={240}
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <div style={{ color: 'white', fontSize: 120, fontWeight: 'bold' }}>
                {token.symbol.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px', marginBottom: '10px' }}>
              <span style={{ fontSize: 80, fontWeight: 'bold', color: 'white' }}>{token.symbol}</span>
              <span style={{ fontSize: 40, color: 'rgba(255,255,255,0.5)' }}>{token.name}</span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px' }}>
              <span style={{ fontSize: 56, fontWeight: 600, color: '#10b981' }}>{formatPrice(token.market.price)}</span>
              <span style={{ 
                fontSize: 24, 
                padding: '8px 16px', 
                borderRadius: '8px', 
                background: token.market.priceChange24h >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: token.market.priceChange24h >= 0 ? '#10b981' : '#ef4444',
                fontWeight: 'bold'
              }}>
                {token.market.priceChange24h >= 0 ? '+' : ''}{token.market.priceChange24h?.toFixed(2)}%
              </span>
            </div>

            {/* Risk Score Section */}
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

        {/* Footer */}
        <div style={{ position: 'absolute', bottom: 40, left: 80, display: 'flex', color: 'rgba(255,255,255,0.3)', fontSize: 24, fontWeight: 500 }}>
          Unbiased Data-Driven Research & Market Analysis
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
