import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/about#methodology", label: "Methodology" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/contact", label: "Contact" },
] as const;

/**
 * Site-wide footer with legal links, disclaimer text, and copyright.
 * Renders on every page as part of the root layout.
 */
export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer" id="site-footer">
      <div className="container footer-inner">
        <ul className="footer-links">
          {FOOTER_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link href={href}>{label}</Link>
            </li>
          ))}
        </ul>

        <p className="footer-disclaimer">
          TokenRadar provides data-driven analysis and research for
          informational purposes only. Nothing on this site constitutes
          financial advice, investment recommendations, or an endorsement of any
          cryptocurrency. Always do your own research (DYOR) and consult a
          qualified financial advisor before making investment decisions.
          Cryptocurrency investments are highly volatile and carry significant
          risk of loss.
        </p>

        <div className="footer-bottom">
          <span>© {currentYear} TokenRadar. All rights reserved.</span>
          <span className="last-updated">
            Data powered by CoinGecko
          </span>
        </div>
      </div>
    </footer>
  );
}
