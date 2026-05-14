import type { RecirculationItem } from "@/components/ResearchRecirculation";
import { slugify } from "@/lib/shared-utils";

interface BuildTokenResearchActionsOptions {
  tokenId: string;
  name: string;
  symbol: string;
  category?: string;
  hasPricePrediction?: boolean;
  hasHowToBuy?: boolean;
  hasLedgerGuide?: boolean;
  relatedToken?: {
    id: string;
    name: string;
    symbol: string;
  };
}

export function buildTokenResearchActions({
  tokenId,
  name,
  symbol,
  category,
  hasPricePrediction,
  hasHowToBuy,
  hasLedgerGuide,
}: BuildTokenResearchActionsOptions): RecirculationItem[] {
  const upperSymbol = symbol.toUpperCase();
  const items: RecirculationItem[] = [];

  if (hasPricePrediction) {
    items.push({
      href: `/${tokenId}/price-prediction`,
      label: `${upperSymbol} price scenarios`,
      description: "Compare upside, base, and downside conditions before over-reading a short-term move.",
      type: "prediction",
    });
  }

  if (hasHowToBuy) {
    items.push({
      href: `/${tokenId}/how-to-buy`,
      label: `${upperSymbol} buying checklist`,
      description: "Verify venues, pairs, fees, withdrawals, custody, and regional access before funding.",
      type: "buy",
    });
  }

  if (hasLedgerGuide) {
    items.push({
      href: `/${tokenId}/transfer-to-ledger`,
      label: `Move ${upperSymbol} to Ledger`,
      description: "Use a network-specific custody checklist before sending a larger transfer.",
      type: "wallet",
    });
  } else {
    items.push({
      href: "/best-crypto-hardware-wallets",
      label: "Compare custody options",
      description: `Review wallet tradeoffs before deciding where ${name} should be held.`,
      type: "wallet",
    });
  }

  items.push({
    href: "/crypto-tax-guide",
    label: "Plan records and taxes",
    description: "Keep fills, fees, withdrawals, transfers, and cost-basis notes organized from day one.",
    type: "tax",
  });

  if (category) {
    items.push({
      href: `/category/${slugify(category)}`,
      label: `Compare ${category}`,
      description: `See how ${name} sits beside other assets in the same research category.`,
      type: "category",
    });
  }

  return items;
}

export function buildArticleCompletionActions(
  options: BuildTokenResearchActionsOptions,
  currentArticleType: "overview" | "price-prediction" | "how-to-buy",
): RecirculationItem[] {
  const base = buildTokenResearchActions(options).filter((item) => {
    if (currentArticleType === "price-prediction") return item.type !== "prediction";
    if (currentArticleType === "how-to-buy") return item.type !== "buy";
    return true;
  });

  const learnItem: RecirculationItem =
    currentArticleType === "how-to-buy"
      ? {
          href: "/learn/liquidity-depth",
          label: "Check liquidity depth",
          description: "Understand whether a market can absorb the position size you are considering.",
          type: "learn",
        }
      : {
          href: "/learn/fully-diluted-valuation-fdv",
          label: "Review FDV and dilution",
          description: "Separate current market cap from future supply pressure before comparing assets.",
          type: "learn",
        };

  const relatedItem = options.relatedToken
    ? [{
        href: `/${options.relatedToken.id}`,
        label: `Compare ${options.relatedToken.symbol.toUpperCase()}`,
        description: `${options.relatedToken.name} is a related asset worth checking next.`,
        type: "related" as const,
      }]
    : [];

  return [learnItem, ...relatedItem, ...base].slice(0, 5);
}
