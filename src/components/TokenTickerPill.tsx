import { formatPrice } from "@/lib/content-loader";

interface TokenTickerPillProps {
  name: string;
  symbol: string;
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
  price, 
  imageUrl,
  className = "" 
}: TokenTickerPillProps) {
  return (
    <span className={`token-ticker-pill ${className}`}>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img 
          src={imageUrl} 
          alt={`${name} icon`} 
          className="pill-icon"
          width={18}
          height={18}
        />
      )}
      <span className="pill-text">
        <span className="pill-name">{name.toUpperCase()}</span>
        <span className="pill-divider">-</span>
        <span className="pill-price">{formatPrice(price)}</span>
      </span>
    </span>
  );
}
