"use client";

import { useEffect, useState } from "react";

/**
 * Sticky bottom banner for high-conversion affiliate links.
 * Remains visible on screen while the user reads long-form content.
 */
export function StickyBanner({ symbol }: { symbol: string }) {
  const [isVisible, setIsVisible] = useState(false);

  // Delay visibility slightly so it slides in after page load
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  // Referral links map
  const exchangeLinks = [
    {
      name: "Binance",
      url: `https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_65AUB&utm_source=default`,
      color: "#FCD535",
      text: "#000",
    },
    {
      name: "Bybit",
      url: `https://www.bybit.com/invite?ref=QONQNG`,
      color: "#F7A600",
      text: "#fff",
    },
    {
      name: "OKX",
      url: `https://okx.com/join/66004268`,
      color: "#fff",
      text: "#000",
    },
    {
      name: "KuCoin",
      url: `https://www.kucoin.com/r/rf/FQ67QZ7A`,
      color: "#00A277",
      text: "#fff",
    },
  ];

  return (
    <div className="sticky-banner animate-in">
      <div className="container sticky-banner-inner">
        <div className="sticky-banner-text">
          <span className="sticky-banner-title">Trade <strong>{symbol.toUpperCase()}</strong> Now</span>
          <span className="sticky-banner-sub">Secure the best rates on top exchanges</span>
        </div>
        <div className="sticky-banner-links">
          {exchangeLinks.map((ex) => (
            <a
              key={ex.name}
              href={ex.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="sticky-btn"
              style={{ backgroundColor: ex.color, color: ex.text }}
            >
              {ex.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
