"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { HackerText } from "./HackerText";
import { Activity, Clock, BookOpen, ShieldCheck, Calculator, HelpCircle, Info } from "lucide-react";

const NAV_LINKS = [
  { name: "Tokens", href: "/#trending", icon: Activity },
  // { name: "Compare", href: "/compare", icon: Scale },
  { name: "Hardware", href: "/best-crypto-hardware-wallets", badge: "SECURE", badgeColor: "#10b981", icon: ShieldCheck },
  { name: "Tax Guide", href: "/crypto-tax-guide", badge: "NEW", badgeColor: "#3b82f6", icon: Calculator },
  { name: "Upcoming", href: "/upcoming", icon: Clock },
  { name: "Methodology", href: "/about", icon: BookOpen },
  { name: "Contact", href: "/contact", icon: HelpCircle },
  { name: "Disclaimer", href: "/disclaimer", icon: Info },
] as const;

/**
 * Sticky top navigation bar with glassmorphism backdrop.
 * Highlights the active link based on the current route.
 */
export function Navigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  // Prevent scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [isOpen]);

  return (
    <nav className="nav" id="main-nav">
      <div className="container nav-inner">
        <Link href="/" className="nav-logo" aria-label="TokenRadar Home" style={{ flexShrink: 0 }}>
          <Image src="/icon.png" alt="TokenRadar Logo" width={32} height={32} className="nav-logo-img" />
          <span>
            <span style={{ color: "var(--accent-primary)" }}>[</span>
            <HackerText text="TokenRadar" />
            <span style={{ color: "var(--accent-primary)" }}>]</span>
          </span>
        </Link>
        
        {/* Hamburger Toggle */}
        <button 
          className="mobile-nav-toggle" 
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close menu" : "Open menu"}
        >
          {isOpen ? <HackerText text="✕" /> : <HackerText text="☰" />}
        </button>

        <ul className={`nav-links ${isOpen ? "open" : ""}`}>
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <li key={link.href} className="nav-link-item">
                <Link
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={isActive ? "active" : ""}
                >
                  <Icon 
                    size={20} 
                    className="nav-icon" 
                    style={{ 
                      color: "badge" in link ? link.badgeColor : "inherit"
                    }} 
                  />
                  <span>{link.name}</span>
                  {"badge" in link && (
                    <span 
                      className={`nav-badge ${link.badge === "SECURE" ? "badge-pulse" : "badge-shimmer"}`}
                      style={{ 
                        backgroundColor: link.badgeColor, 
                        color: "white",
                        border: `1px solid ${link.badgeColor}44`
                      }}
                    >
                      {link.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
