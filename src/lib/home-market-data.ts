import {
  getAllTokens,
  getCategoryIds,
  getPrimaryTokenCategory,
  getTokenMetrics,
} from "@/lib/content-loader";

export interface HomeMarketToken {
  id: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  price: number;
  priceChange24h: number;
  marketCap: number;
  rank?: number;
  riskScore: number;
  category: string;
  categoryHref?: string;
}

export async function getHomeMarketTokens(): Promise<HomeMarketToken[]> {
  const [tokens, categoryIds] = await Promise.all([getAllTokens(), getCategoryIds()]);
  return Promise.all(tokens.map(async (token) => {
    const metrics = await getTokenMetrics(token.id);
    const category = getPrimaryTokenCategory(token.categories, categoryIds);
    return {
      id: token.id,
      name: token.name,
      symbol: token.symbol,
      imageUrl: token.imageUrl || token.image,
      price: token.price,
      priceChange24h: token.priceChange24h,
      marketCap: token.marketCap,
      rank: token.rank,
      riskScore: metrics?.riskScore ?? 5,
      category: category.name,
      categoryHref: category.href,
    };
  }));
}
