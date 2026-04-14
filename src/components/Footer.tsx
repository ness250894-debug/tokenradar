import Link from "next/link";
import Image from "next/image";
import { HackerText } from "./HackerText";
import { XIcon, TelegramIcon } from "./SocialIcons";


/**
 * Group definitions for footer columns
 */
const PLATFORM_LINKS = [
  { href: "/#trending", label: "Explore Market" },
  { href: "/upcoming", label: "Upcoming Launches" },
  { href: "/about#methodology", label: "Methodology" },
] as const;

const RESOURCE_LINKS = [
  { href: "/about", label: "About TokenRadar" },
  { href: "/contact", label: "Contact Us" },
] as const;

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/disclaimer", label: "Disclaimer" },
] as const;

const COMPARISON_LINKS = [
  { href: "/compare/bitcoin-vs-ethereum", label: "BTC vs ETH" },
  { href: "/compare/solana-vs-ethereum", label: "SOL vs ETH" },
  { href: "/compare/dogecoin-vs-shiba-inu", label: "DOGE vs SHIB" },
  { href: "/compare/pepe-vs-bonk", label: "PEPE vs BONK" },
] as const;

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer" id="site-footer">
      <div className="container footer-inner">
        <div className="footer-grid">
          {/* Brand Column */}
          <div className="footer-brand">
            <Link href="/" className="footer-brand-logo">
              <Image src="/icon.png" alt="Logo" width={24} height={24} className="nav-logo-img" />
              <span>
                <span style={{ color: "var(--accent-primary)" }}>[</span>
                <HackerText text="TokenRadar" />
                <span style={{ color: "var(--accent-primary)" }}>]</span>
              </span>
            </Link>
            <p className="footer-brand-blurb">
              The premier data-driven analysis hub for high-potential crypto narratives, risk vetting, and market insights.
            </p>
            <div style={{ display: "flex", gap: "var(--space-md)", marginTop: "var(--space-sm)" }}>
              <Link href="https://x.com/tokenradarco" target="_blank" className="footer-links a" style={{ color: "var(--text-secondary)" }}>
                <XIcon size={20} />
              </Link>
              <Link href="https://t.me/TokenRadarCo" target="_blank" className="footer-links a" style={{ color: "var(--text-secondary)" }}>
                <TelegramIcon size={20} />
              </Link>
            </div>
          </div>

          {/* Platform Column */}
          <div>
            <h4 className="footer-col-title">Platform</h4>
            <ul className="footer-col-links">
              {PLATFORM_LINKS.map(({ href, label }) => (
                <li key={href}><Link href={href}>{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Resources Column */}
          <div>
            <h4 className="footer-col-title">Resources</h4>
            <ul className="footer-col-links">
              {RESOURCE_LINKS.map(({ href, label }) => (
                <li key={href}><Link href={href}>{label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Legal Column */}

          {/* Legal Column */}
          <div>
            <h4 className="footer-col-title">Legal</h4>
            <ul className="footer-col-links">
              {LEGAL_LINKS.map(({ href, label }) => (
                <li key={href}><Link href={href}>{label}</Link></li>
              ))}
            </ul>
          </div>
        </div>

        <p className="footer-disclaimer">
          TokenRadar provides data-driven analysis and research for informational purposes only. Nothing on this site constitutes financial advice, investment recommendations, or an endorsement of any cryptocurrency. Always do your own research (DYOR) and consult a qualified financial advisor before making investment decisions. Cryptocurrency investments are highly volatile and carry significant risk of loss.
        </p>

        <div className="footer-bottom">
          <span>© {currentYear} TokenRadar. All rights reserved.</span>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-xl)" }}>
            <div className="status-pill">
              <div className="status-dot"></div>
              <span>System Status: Online</span>
            </div>
            <span className="last-updated">Data powered by CoinGecko</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
