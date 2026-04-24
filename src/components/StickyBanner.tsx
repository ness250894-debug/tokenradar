"use client";

import { useEffect, useState } from "react";
import { REFERRAL_URLS } from "@/lib/config";

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
      url: REFERRAL_URLS.binance,
      color: "#FCD535",
      text: "#000",
    },
    {
      name: "Bybit",
      url: REFERRAL_URLS.bybit,
      color: "#F7A600",
      text: "#fff",
    },
    {
      name: "OKX",
      url: REFERRAL_URLS.okx,
      color: "#fff",
      text: "#000",
    },
    {
      name: "KuCoin",
      url: REFERRAL_URLS.kucoin,
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
