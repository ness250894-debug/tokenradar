import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { getTokenIconUrl } from './formatters';

export interface MoverToken {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
}

let robotoFontBuffer: ArrayBuffer | null = null;

async function getFont() {
  if (!robotoFontBuffer) {
    const res = await fetch('https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Medium.ttf');
    robotoFontBuffer = await res.arrayBuffer();
  }
  return robotoFontBuffer;
}

export async function generateMoversImage(tokens: MoverToken[]): Promise<Buffer> {
  const fontData = await getFont();

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
        fontFamily: '"Roboto"',
        position: 'relative',
        padding: '60px 80px',
      }}
    >
      {/* Background Gradient */}
      <div 
        style={{
          position: 'absolute',
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          background: 'radial-gradient(circle at center, rgba(16, 185, 129, 0.04) 0%, transparent 70%)',
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#10b981', fontSize: 24, fontWeight: 'bold', letterSpacing: '0.1em', marginBottom: '8px' }}>DAILY MARKET REPORT</span>
          <span style={{ color: 'white', fontSize: 48, fontWeight: 'bold' }}>Top 5 Gainers (24h)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 32, height: 32, background: '#10b981', borderRadius: '8px' }} />
          <span style={{ color: 'white', fontSize: 32, fontWeight: 'bold' }}>
            TOKEN<span style={{ color: '#10b981' }}>RADAR</span>
          </span>
        </div>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '16px' }}>
        {tokens.map((token, index) => (
          <div 
            key={token.id}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              background: 'rgba(255,255,255,0.03)', 
              padding: '24px 32px', 
              borderRadius: '20px', 
              border: '1px solid rgba(255,255,255,0.05)',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 32, fontWeight: 'bold', width: '30px' }}>{index + 1}</span>
              <div style={{ display: 'flex', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)', background: '#111', width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={getTokenIconUrl(token.symbol, token.id)}
                  alt={token.name}
                  width={64}
                  height={64}
                  style={{ objectFit: 'contain' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: 'white', fontSize: 32, fontWeight: 'bold' }}>{token.symbol.toUpperCase()}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18 }}>{token.name}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, marginBottom: '4px' }}>PRICE</span>
                <span style={{ color: 'white', fontSize: 28, fontWeight: 'bold' }}>
                  {token.price ? (token.price >= 1 ? `$${token.price.toFixed(2)}` : `$${token.price.toFixed(6)}`) : '$0.00'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '120px' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, marginBottom: '4px' }}>24H CHANGE</span>
                <span style={{ color: '#10b981', fontSize: 28, fontWeight: 'bold' }}>
                  {token.change24h ? `+${token.change24h.toFixed(2)}%` : '0.00%'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', bottom: 40, right: 80, display: 'flex', color: 'rgba(255,255,255,0.2)', fontSize: 18 }}>
        Real-time market intelligence by TokenRadar.co
      </div>
    </div>
  );

  const svg = await satori(element, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Roboto',
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
  return pngData.asPng();
}
