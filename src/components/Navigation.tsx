"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { name: "Tokens", href: "/#trending" },
  { name: "Upcoming", href: "/upcoming" },
  { name: "Methodology", href: "/about" },
  { name: "Contact", href: "/contact" },
  { name: "Disclaimer", href: "/disclaimer" },
] as const;

/**
 * Sticky top navigation bar with glassmorphism backdrop.
 * Highlights the active link based on the current route.
 */
export function Navigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="nav" id="main-nav">
      <div className="container nav-inner">
        <Link href="/" className="nav-logo" aria-label="TokenRadar Home">
          <Image src="/icon.png" alt="TokenRadar Logo" width={32} height={32} className="nav-logo-img" />
          <span>
            Token<span className="gradient-text">Radar</span>
          </span>
        </Link>
        
        {/* Hamburger Toggle */}
        <button 
          className="mobile-nav-toggle" 
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close menu" : "Open menu"}
        >
          {isOpen ? "✕" : "☰"}
        </button>

        <ul className={`nav-links ${isOpen ? "open" : ""}`}>
          {NAV_LINKS.map(({ href, name }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setIsOpen(false)}
                style={
                  pathname === href
                    ? { color: "var(--text-primary)" }
                    : undefined
                }
              >
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
