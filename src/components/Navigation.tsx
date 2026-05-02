"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { HackerText } from "./HackerText";
import { Activity, Clock, BookOpen, ShieldCheck, Calculator, HelpCircle, Info, FileText, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { name: "Tokens", href: "/#tokens", icon: Activity, color: "var(--accent-primary)" },
  { name: "Hardware", href: "/best-crypto-hardware-wallets", badge: "SECURE", badgeColor: "var(--green)", icon: ShieldCheck, color: "var(--green)" },
  { name: "Tax Guide", href: "/crypto-tax-guide", badge: "NEW", badgeColor: "var(--accent-secondary)", icon: Calculator, color: "var(--accent-secondary)" },
  { name: "Upcoming", href: "/upcoming", icon: Clock, color: "var(--accent-primary)" },
  { name: "Learn", href: "/learn", icon: BookOpen, color: "var(--accent-secondary)" },
  { name: "Methodology", href: "/about", icon: FileText, color: "var(--text-secondary)" },
  { name: "Contact", href: "/contact", icon: HelpCircle, color: "var(--accent-secondary)" },
  { name: "Disclaimer", href: "/disclaimer", icon: Info, color: "var(--red)" },
] as const;

/**
 * Sticky top navigation bar with glassmorphism backdrop.
 * Highlights the active link based on the current route.
 */
export function Navigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Prevent vertical scroll when the mobile menu is open.
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflowY = "hidden";
    } else {
      document.body.style.overflowY = "";
    }
    return () => { document.body.style.overflowY = ""; };
  }, [isOpen]);

  return (
    <nav className="nav" id="main-nav">
      <div className="container nav-inner">
        <Link href="/" className="nav-logo" aria-label="TokenRadar Home" style={{ flexShrink: 0 }} onClick={() => setIsOpen(false)}>
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
          aria-controls="primary-nav-links"
          aria-expanded={isOpen}
        >
          {isOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        </button>

        <ul className={`nav-links ${isOpen ? "open" : ""}`} id="primary-nav-links">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const isActive = link.href.startsWith("/#") ? pathname === "/" : pathname === link.href;
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
                      color: link.color || "inherit"
                    }}
                  />
                  <span>{link.name}</span>
                  {"badge" in link && (
                    <span
                      className={`nav-badge ${link.badge === "SECURE" ? "badge-pulse" : "badge-shimmer"}`}
                      style={{
                        backgroundColor: link.badgeColor,
                        color: "var(--bg-primary)",
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
