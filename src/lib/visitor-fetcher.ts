/**
 * Cloudflare Analytics Fetcher
 * 
 * Fetches unique visitor data using the Cloudflare GraphQL API.
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const CLOUDFLARE_GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";

export interface VisitorStats {
  uniques: number;
}

/**
 * Fetches unique visitor counts for a given number of days.
 */
export async function getVisitorStats(days: number): Promise<VisitorStats> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;

  if (!token || !zoneId) {
    console.warn("  [visitor-fetcher] CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not set.");
    return { uniques: 0 };
  }

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const query = `
    query GetVisitorStats($zoneId: String!, $startDate: String!, $endDate: String!) {
      viewer {
        zones(filter: { zoneTag: $zoneId }) {
          httpRequests1dGroups(
            limit: 100,
            filter: { date_geq: $startDate, date_leq: $endDate }
          ) {
            sum {
              uniques
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(CLOUDFLARE_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { zoneId, startDate, endDate },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`  [visitor-fetcher] Cloudflare API error: ${response.status} — ${err}`);
      return { uniques: 0 };
    }

    const json = await response.json() as { data?: { viewer?: { zones?: { httpRequests1dGroups?: { sum?: { uniques?: number } }[] }[] } } };
    // Note: sum.uniques across httpRequests1dGroups is the sum of per-day uniques,
    // not true cross-day unique visitors. This is a Cloudflare API limitation.
    const groups = json.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
    const uniques = groups.reduce((acc: number, g: { sum?: { uniques?: number } }) => acc + (g?.sum?.uniques ?? 0), 0);

    return { uniques };
  } catch (error) {
    console.error(`  [visitor-fetcher] Error fetching visitor stats: ${error}`);
    return { uniques: 0 };
  }
}
