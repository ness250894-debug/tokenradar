import { generateMoversImage } from '../../../../lib/movers-generator';
import tokensData from '../../../../../data/tokens.json';

export const runtime = 'edge';

export async function GET() {
  try {
    // 1. Get Top 5 Gainers
    const movers = [...tokensData]
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

    // 2. Generate PNG
    const pngBuffer = await generateMoversImage(movers);

    // 3. Return as Image Response
    return new Response(new Uint8Array(pngBuffer), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Failed to generate movers image:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
}
