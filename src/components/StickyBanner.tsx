"use client";

import Link from "next/link";
import { Calculator, ShieldCheck, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Sticky bottom navigation for token research routes.
 * Keeps high-intent internal guides visible without showing paid exchange links
 * on every token page.
 */
export function StickyBanner({
  symbol,
  tokenId,
}: {
  symbol: string;
  tokenId: string;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let ready = false;

    const revealAfterReadingStarts = () => {
      if (!ready) return;
      setIsVisible(window.scrollY > 360);
    };

    const timer = window.setTimeout(() => {
      ready = true;
      revealAfterReadingStarts();
    }, 1500);

    window.addEventListener("scroll", revealAfterReadingStarts, { passive: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", revealAfterReadingStarts);
    };
  }, []);

  if (!isVisible) return null;

  const links = [
    {
      href: `/${tokenId}/how-to-buy`,
      label: "Buy Guide",
      icon: ShoppingCart,
      analyticsId: "sticky-internal-how-to-buy",
    },
    {
      href: "/best-crypto-hardware-wallets",
      label: "Wallets",
      icon: ShieldCheck,
      analyticsId: "sticky-internal-wallets",
    },
    {
      href: "/crypto-tax-guide",
      label: "Taxes",
      icon: Calculator,
      analyticsId: "sticky-internal-tax",
    },
  ];

  return (
    <div className="sticky-banner animate-in">
      <div className="container sticky-banner-inner">
        <div className="sticky-banner-text">
          <span className="sticky-banner-title">Research <strong>{symbol.toUpperCase()}</strong></span>
          <span className="sticky-banner-sub">Compare markets, custody, and tax workflows</span>
        </div>
        <div className="sticky-banner-links">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="sticky-btn"
                data-analytics-id={item.analyticsId}
                data-analytics-label={`${symbol.toUpperCase()} ${item.label}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Icon size={14} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
