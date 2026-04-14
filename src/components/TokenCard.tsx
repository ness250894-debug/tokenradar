"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TokenTickerPill } from "./TokenTickerPill";
import { CardGlare } from "./CardGlare";
import { slugify } from "@/lib/shared-utils";

export interface TokenCardData {
  id: string;
  name: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  marketCap: number;
  riskScore: number;
  category: string;
  imageUrl?: string;
}

interface TokenCardProps {
  token: TokenCardData;
}

/**
 * Formats a number as compact currency (e.g., $1.23B, $456M).
 */
function formatCompact(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

/**
 * Formats price with appropriate decimal places.
 */
function _formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

/**
 * Token summary card used in listings (homepage, search results).
 * Shows rank, name, price, 24h change, market cap, risk score, and category badge.
 */
export function TokenCard({ token }: TokenCardProps) {
  const router = useRouter();
  const isPositive = token.priceChange24h >= 0;
  const riskLevel = token.riskScore <= 3 ? "green" : token.riskScore <= 6 ? "yellow" : "red";

  const handleCategoryClick = (e: React.MouseEvent) => {
    // Prevent the parent <Link> from triggering
    e.preventDefault();
    e.stopPropagation();
    router.push(`/category/${slugify(token.category)}`);
  };

  return (
    <CardGlare style={{ height: "100%" }}>
      <Link 
        href={`/${token.id}`} 
        className="block h-full no-underline group"
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <div className="card h-full flex flex-col relative transition-all duration-300">
          {/* Card Content Layer */}
          <div className="flex justify-between items-start gap-sm">
            <div className="flex-1 min-w-0">
              <div className="token-name min-w-0">
                <TokenTickerPill 
                  name={token.name} 
                  symbol={token.symbol} 
                  id={token.id}
                  price={token.price} 
                  imageUrl={token.imageUrl} 
                />
              </div>
              <div className="mt-sm">
                <div 
                  onClick={handleCategoryClick}
                  className="badge badge-accent hover-scale inline-block relative z-30 cursor-pointer"
                >
                  {token.category}
                </div>
              </div>
            </div>
            <span className={`badge badge-${riskLevel} flex-shrink-0 relative z-10`}>
              Risk {token.riskScore}/10
            </span>
          </div>

          <div className="grid grid-cols-2 gap-md mt-xl pt-md border-t border-color mt-auto">
            <div>
              <div className="stat-label mb-1">24h Change</div>
              <div className={`stat-value text-lg ${isPositive ? "price-up" : "price-down"}`}>
                {isPositive ? "▲" : "▼"} {Math.abs(token.priceChange24h).toFixed(2)}%
              </div>
            </div>
            <div className="text-right">
              <div className="stat-label mb-1">Market Cap</div>
              <div className="stat-value text-lg">{formatCompact(token.marketCap)}</div>
            </div>
          </div>
        </div>
      </Link>
    </CardGlare>
  );
}
