import { getTokenDirectoryData } from "@/lib/token-directory-data";

export const dynamic = "force-static";

export async function GET() {
  const { cards } = await getTokenDirectoryData();

  return Response.json(cards, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}
