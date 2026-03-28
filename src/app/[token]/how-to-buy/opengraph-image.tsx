import { getTokenDetail, getTokenMetrics, getTokenIds } from "@/lib/content-loader";
import { generateTokenOgImage } from "@/lib/og-generator";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "TokenRadar How to Buy Guide";

export async function generateStaticParams() {
  return getTokenIds().map((id) => ({ token: id }));
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token: tokenId } = await params;
  
  const detail = getTokenDetail(tokenId);
  const metrics = getTokenMetrics(tokenId);

  if (!detail || !metrics) {
    return new Response("Not Found", { status: 404 });
  }

  return generateTokenOgImage({
    name: detail.name,
    symbol: detail.symbol,
    price: detail.market.price,
    riskScore: metrics.riskScore,
    subtitle: "Complete How-to-Buy Guide"
  });
}
