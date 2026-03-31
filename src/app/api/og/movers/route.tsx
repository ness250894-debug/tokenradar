import { ImageResponse } from "next/og";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-static";

type TokenData = { id: string; name: string; symbol: string; market: { price: number; priceChange24h: number } };

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), "data", "tokens");
    if (!fs.existsSync(dataDir)) {
      return new Response("Data not found", { status: 500 });
    }

    const files = fs.readdirSync(dataDir).filter((file) => file.endsWith(".json"));
    const tokens: TokenData[] = [];

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8"));
        if (data && data.market && typeof data.market.priceChange24h === "number" && typeof data.market.price === "number") {
          tokens.push({
            id: data.id,
            name: data.name,
            symbol: data.symbol,
            market: { price: data.market.price, priceChange24h: data.market.priceChange24h }
          });
        }
      } catch (e) {
        // Skip malformed files
      }
    }

    // Top 5 Gainers
    const sorted = tokens.sort((a, b) => b.market.priceChange24h - a.market.priceChange24h).slice(0, 5);

    return new ImageResponse(
      (
        <div style={{ display: "flex", flexDirection: "column", background: "linear-gradient(to bottom, #0F172A, #020617)", width: "100%", height: "100%", padding: "60px", color: "white", fontFamily: "sans-serif" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
            <h1 style={{ fontSize: "64px", fontWeight: "bold", margin: 0, color: "#38BDF8" }}>Top 5 Market Movers</h1>
            <span style={{ fontSize: "32px", color: "#94A3B8" }}>TokenRadar.co</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
            {sorted.map((token, i) => (
              <div key={token.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255, 255, 255, 0.05)", padding: "24px 40px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                  <div style={{ fontSize: "40px", fontWeight: "bold", color: "#64748B" }}>#{i + 1}</div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: "48px", fontWeight: "bold" }}>{token.symbol.toUpperCase()}</span>
                    <span style={{ fontSize: "24px", color: "#94A3B8" }}>{token.name}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={{ fontSize: "48px", fontWeight: "bold", color: "#4ADE80" }}>+{token.market.priceChange24h.toFixed(2)}%</span>
                  <span style={{ fontSize: "32px", color: "#E2E8F0" }}>${token.market.price >= 1 ? token.market.price.toFixed(2) : token.market.price.toFixed(6)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
      { width: 1200, height: 800 }
    );
  } catch (err: any) {
    console.error("OG Image Error:", err);
    return new Response("Error generating image", { status: 500 });
  }
}
