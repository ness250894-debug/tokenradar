import { TokenIcon } from "./TokenIcon";
import { formatPrice } from "@/lib/formatters";

interface TokenTickerPillProps {
  name: string;
  symbol: string;
  id?: string;
  price: number;
  imageUrl?: string;
  className?: string;
}

/**
 * Premium "Pill" styled token ticker.
 * Displays [Icon] NAME - $PRICE in a rounded dark container.
 */
export function TokenTickerPill({ 
  name, 
  symbol,
  id,
  price, 
  imageUrl,
  className = "" 
}: TokenTickerPillProps) {
  return (
    <span className={`token-ticker-pill ${className}`} style={{ minWidth: 0, maxWidth: "100%" }}>
      <TokenIcon 
        symbol={symbol} 
        name={name} 
        id={id} 
        imageUrl={imageUrl}
        size={18} 
        className="pill-icon"
      />
      <span className="pill-text" style={{ minWidth: 0 }}>
        <span className="pill-name" title={name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name.toUpperCase()}</span>
        <span className="pill-divider">-</span>
        <span className="pill-price">{formatPrice(price)}</span>
      </span>
    </span>
  );
}
