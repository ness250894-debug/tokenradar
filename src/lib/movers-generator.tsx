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
    if (!res.ok) {
      throw new Error(`Failed to fetch Roboto font: HTTP ${res.status}`);
    }
    robotoFontBuffer = await res.arrayBuffer();
  }
  return robotoFontBuffer;
}

export async function generateMoversImage(tokens: MoverToken[]): Promise<Buffer> {
  const fontData = await getFont();

  const element = (
    <div
      style={{
        background: '#0a0b0f',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        fontFamily: '"Roboto"',
        position: 'relative',
        padding: '30px 60px',
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
          background: 'radial-gradient(circle at center, rgba(245, 158, 11, 0.08) 0%, transparent 60%)',
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ color: '#f59e0b', fontSize: 24, fontWeight: 'bold', letterSpacing: '0.1em', marginBottom: '4px' }}>DAILY MARKET REPORT</span>
          <span style={{ color: '#f0f0f5', fontSize: 40, fontWeight: 'bold', marginBottom: '8px' }}>Top 5 Gainers (24h)</span>
          <span style={{ color: '#5d5f72', fontSize: 18 }}>Real-time market intelligence by TokenRadar.co</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 32, height: 32, background: '#f59e0b', borderRadius: '8px' }} />
          <span style={{ color: '#f0f0f5', fontSize: 32, fontWeight: 'bold' }}>
            TOKEN<span style={{ color: '#f59e0b' }}>RADAR</span>
          </span>
        </div>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '8px' }}>
        {tokens.map((token, index) => (
          <div 
            key={token.id}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              background: '#181922', 
              padding: '8px 24px', 
              borderRadius: '12px', 
              border: '1px solid rgba(255,255,255,0.06)',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <span style={{ color: '#5d5f72', fontSize: 24, fontWeight: 'bold', width: '30px' }}>{index + 1}</span>
              <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: '#12131a', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getTokenIconUrl(token.symbol, token.id)}
                  alt={token.name}
                  width={48}
                  height={48}
                  style={{ objectFit: 'contain' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#f0f0f5', fontSize: 28, fontWeight: 'bold' }}>{token.symbol.toUpperCase()}</span>
                <span style={{ color: '#9395a5', fontSize: 16 }}>{token.name}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ color: '#9395a5', fontSize: 14, marginBottom: '2px' }}>PRICE</span>
                <span style={{ color: '#f0f0f5', fontSize: 28, fontWeight: 'bold' }}>
                  {token.price ? (token.price >= 1 ? `$${token.price.toFixed(2)}` : `$${token.price.toFixed(6)}`) : '$0.00'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '110px' }}>
                <span style={{ color: '#9395a5', fontSize: 14, marginBottom: '2px' }}>24H CHANGE</span>
                <span style={{ color: '#00e676', fontSize: 28, fontWeight: 'bold' }}>
                  {token.change24h ? `+${token.change24h.toFixed(2)}%` : '0.00%'}
                </span>
              </div>
            </div>
          </div>
        ))}
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
    background: '#0a0b0f',
    fitTo: {
      mode: 'width',
      value: 1200,
    },
  });

  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}
