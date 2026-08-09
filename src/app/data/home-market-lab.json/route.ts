import { getHomeMarketTokens } from "@/lib/home-market-data";

export const dynamic = "force-static";

export async function GET() {
  return Response.json(await getHomeMarketTokens(), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}
