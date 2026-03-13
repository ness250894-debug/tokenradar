"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/disclaimer", label: "Disclaimer" },
] as const;

/**
 * Sticky top navigation bar with glassmorphism backdrop.
 * Highlights the active link based on the current route.
 */
export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="nav" id="main-nav">
      <div className="container nav-inner">
        <Link href="/" className="nav-logo" aria-label="TokenRadar Home">
          <span className="nav-logo-icon" aria-hidden="true">
            ◈
          </span>
          <span>
            Token<span className="gradient-text">Radar</span>
          </span>
        </Link>

        <ul className="nav-links">
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                style={
                  pathname === href
                    ? { color: "var(--text-primary)" }
                    : undefined
                }
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
