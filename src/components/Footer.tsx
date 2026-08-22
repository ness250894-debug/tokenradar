import Image from "next/image";
import Link from "next/link";
import { HackerText } from "./HackerText";
import { InstagramIcon, TelegramIcon, ThreadsIcon, TikTokIcon, XIcon } from "./SocialIcons";
import { SOCIAL } from "../lib/config";

const PLATFORM_LINKS = [
  { href: "/tokens", label: "Token Directory" },
  { href: "/search-intent", label: "Research Intent Proxy" },
  { href: "/watchlist", label: "Local Watchlist" },
  { href: "/upcoming", label: "Upcoming Launches" },
  { href: "/research", label: "Market Risk Research" },
  { href: "/about#methodology", label: "Methodology" },
] as const;

const RESOURCE_LINKS = [
  { href: "/learn", label: "Learning Hub / Glossary" },
  { href: "/about", label: "About / Methodology" },
  { href: "/authors/pavlo-nakonechnyi", label: "Founder / Lead Researcher" },
  { href: "/contact", label: "Contact Us" },
] as const;

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/disclaimer", label: "Disclaimer" },
] as const;

const SOCIAL_LINKS = [
  { href: SOCIAL.xUrl, label: "TokenRadar on X", Icon: XIcon },
  { href: SOCIAL.telegramUrl, label: "TokenRadar on Telegram", Icon: TelegramIcon },
  { href: SOCIAL.threadsUrl, label: "TokenRadar on Threads", Icon: ThreadsIcon },
  { href: SOCIAL.instagramUrl, label: "TokenRadar on Instagram", Icon: InstagramIcon },
  { href: SOCIAL.tiktokUrl, label: "TokenRadar on TikTok", Icon: TikTokIcon },
] as const;

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer" id="site-footer">
      <div className="container footer-inner">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link href="/" className="footer-brand-logo">
              <Image
                src="/icon-32.png"
                alt="Logo"
                width={24}
                height={24}
                className="nav-logo-img"
              />
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
              {SOCIAL_LINKS.map(({ href, label, Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="footer-social-link"
                  style={{ color: "var(--text-secondary)" }}
                  aria-label={label}
                >
                  <Icon size={20} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h2 className="footer-col-title">Platform</h2>
            <ul className="footer-col-links">
              {PLATFORM_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="footer-col-title">Resources</h2>
            <ul className="footer-col-links">
              {RESOURCE_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="footer-col-title">Legal</h2>
            <ul className="footer-col-links">
              {LEGAL_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="footer-disclaimer">
          TokenRadar provides automated data-driven analysis and market research for informational purposes only. Nothing on this site constitutes financial advice or investment recommendations. Always conduct independent research and consult a professional before making economic decisions. Market volatility reports are based on public data indices and carry inherent risks.
        </p>

        <div className="footer-bottom">
          <span>&copy; {currentYear} TokenRadar. All rights reserved.</span>
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
