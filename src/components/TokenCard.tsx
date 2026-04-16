"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, DollarSign, ShieldAlert } from "lucide-react";
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

function formatCompact(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export function TokenCard({ token }: TokenCardProps) {
  const router = useRouter();
  const isPositive = token.priceChange24h >= 0;
  const riskLevel = token.riskScore <= 3 ? "green" : token.riskScore <= 6 ? "yellow" : "red";

  const handleCategoryClick = (e: React.MouseEvent) => {
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
        <motion.div 
          className="card h-full flex flex-col relative"
          whileHover={{ y: -5, transition: { duration: 0.2 } }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Card Content Layer */}
          <div className="grid grid-cols-[1fr_auto] items-center gap-sm">
            <div className="min-w-0">
              <div className="token-name w-full" style={{ overflow: "hidden" }}>
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
            <span className={`badge badge-${riskLevel} flex-shrink-0 relative z-10 flex items-center gap-1`}>
              <ShieldAlert size={12} className="opacity-80" />
              Risk {token.riskScore}/10
            </span>
          </div>

          <div className="grid grid-cols-2 gap-md mt-xl pt-md border-t border-color mt-auto">
            <div>
              <div className="stat-label mb-1 flex items-center gap-1">
                {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                24h Change
              </div>
              <div className={`stat-value text-lg flex items-center gap-1 ${isPositive ? "price-up" : "price-down"}`}>
                {isPositive ? "+" : ""}{(token.priceChange24h || 0).toFixed(2)}%
              </div>

            </div>
            <div className="text-right">
              <div className="stat-label mb-1 flex items-center gap-1 justify-end">
                <DollarSign size={10} />
                Market Cap
              </div>
              <div className="stat-value text-lg">{formatCompact(token.marketCap)}</div>
            </div>
          </div>
        </motion.div>
      </Link>
    </CardGlare>
  );
}
