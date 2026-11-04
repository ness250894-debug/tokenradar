import type { TokenCardData } from "@/components/TokenCard";
import {
  getAllTokens,
  getArticle,
  getCategoryIds,
  getPrimaryTokenCategory,
  getSearchIntentDataset,
  getSearchIntentTrendMap,
  getTokenIds,
  getTokenMetrics,
} from "@/lib/content-loader";
import { buildSearchIntentCardFields } from "@/lib/search-intent";
import { isTokenOverviewIndexableFromVolume } from "@/lib/seo";

type DirectoryToken = Awaited<ReturnType<typeof getAllTokens>>[number];

async function getDirectoryTokens(source?: DirectoryToken[]): Promise<DirectoryToken[]> {
  const [tokens, ids] = await Promise.all([source ?? getAllTokens(), getTokenIds()]);
  const published = new Set(ids);
  return tokens.filter((token) => published.has(token.id));
}

export async function getTokenDirectoryData() {
  const [tokens, categoryIds, searchIntentDataset, searchIntentTrendMap] = await Promise.all([
    getDirectoryTokens(),
    getCategoryIds(),
    getSearchIntentDataset(),
    getSearchIntentTrendMap(),
  ]);

  const cards = await Promise.all(tokens.map(async (token): Promise<TokenCardData> => {
    const metrics = await getTokenMetrics(token.id);
    const category = getPrimaryTokenCategory(token.categories, categoryIds);
    const searchIntent = searchIntentDataset?.tokens[token.id];
    const searchIntentTrend = searchIntentTrendMap[token.id];

    return {
      id: token.id,
      name: token.name,
      symbol: token.symbol,
      imageUrl: token.imageUrl || token.image,
      price: token.price,
      priceChange24h: token.priceChange24h,
      marketCap: token.marketCap,
      riskScore: metrics?.riskScore || 5,
      category: category.name,
      categoryHref: category.href,
      ...buildSearchIntentCardFields(searchIntent, searchIntentTrend),
    };
  }));

  return { tokens, cards };
}

export async function getIndexableTokenProfiles(tokens?: DirectoryToken[]) {
  const sourceTokens = await getDirectoryTokens(tokens);
  const candidates = await Promise.all(sourceTokens.map(async (token) => {
    const overview = await getArticle(token.id, "overview");
    return isTokenOverviewIndexableFromVolume(token.volume24h, overview) ? token : null;
  }));

  return candidates
    .filter((token): token is DirectoryToken => Boolean(token))
    .sort((a, b) => a.name.localeCompare(b.name, "en-US"));
}
