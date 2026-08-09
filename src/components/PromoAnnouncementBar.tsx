"use client";

import type { CSSProperties } from "react";
import { useSyncExternalStore } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Tag,
  X,
} from "lucide-react";
import {
  getHomepagePromoPartners,
  getPartnerLinkAttributes,
  getPartnerPlacementUrl,
} from "@/lib/partners";
import { usePartnerRotation } from "@/components/usePartnerRotation";

const STORAGE_KEY = "partner_promo_bar_dismissed_v1";
const PROMO_PARTNERS = getHomepagePromoPartners();

const SMALL_CONTROL_STYLE: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "6px",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  background: "rgba(10, 14, 26, 0.62)",
  color: "var(--text-secondary, #e2e8f0)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getServerSnapshot() {
  return false;
}

export function PromoAnnouncementBar() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const {
    activeIndex,
    goNext,
    goPrevious,
    isPlaying,
  } = usePartnerRotation(dismissed ? 0 : PROMO_PARTNERS.length);

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
      window.dispatchEvent(new Event("storage"));
    } catch (error) {
      console.error(error);
    }
  };

  if (dismissed) return null;

  const partner = PROMO_PARTNERS[activeIndex];
  if (!partner) return null;

  const placement = "top-announcement-carousel";
  const partnerUrl = getPartnerPlacementUrl(partner, placement);
  const linkAttrs = getPartnerLinkAttributes(partner, placement);
  const categoryLabel = partner.category === "tax" ? "Tax" : "Wallet";
  const accentColor = partner.color || "#0099FF";

  return (
    <aside
      className="promo-announcement"
      aria-label="Partner promotion carousel"
      data-nosnippet
      style={{
        background: `linear-gradient(90deg, color-mix(in srgb, ${accentColor} 14%, #101828) 0%, rgba(16, 24, 40, 0.97) 50%, color-mix(in srgb, ${accentColor} 14%, #101828) 100%)`,
        borderBottom: `1px solid color-mix(in srgb, ${accentColor} 32%, transparent)`,
        color: "var(--text-primary, #ffffff)",
        fontSize: "13px",
        position: "relative",
        zIndex: 101,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="container promo-announcement-inner"
      >
        <div
          className="promo-announcement-content"
          aria-live={isPlaying ? "off" : "polite"}
          aria-atomic="true"
        >
          <span
            style={{
              background: accentColor,
              color: partner.textColor || "#ffffff",
              fontSize: "10px",
              fontWeight: 800,
              padding: "2px 6px",
              borderRadius: "4px",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Tag size={10} /> {partner.offer || categoryLabel}
          </span>

          <span className="promo-announcement-copy" style={{ fontWeight: 500, color: "var(--text-secondary, #e2e8f0)" }}>
            <strong>{partner.name}</strong><span className="promo-announcement-copy-detail">: {partner.description}</span>
          </span>

          {partner.coupon ? (
            <code
              className="promo-announcement-coupon"
              style={{
                background: `color-mix(in srgb, ${accentColor} 18%, transparent)`,
                color: accentColor,
                padding: "1px 5px",
                borderRadius: "3px",
                fontFamily: "var(--font-jetbrains, monospace)",
                fontWeight: 700,
                border: `1px solid color-mix(in srgb, ${accentColor} 40%, transparent)`,
              }}
            >
              {partner.coupon}
            </code>
          ) : null}

          <span className="promo-announcement-disclosure-long" style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)" }}>
            {partner.disclosure}
          </span>
          <span className="promo-announcement-disclosure-short" style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)" }}>
            Paid link
          </span>
        </div>

        <div className="promo-announcement-actions">
          <span className="promo-announcement-counter" style={{ color: "var(--text-muted)", fontSize: "11px", minWidth: "30px", textAlign: "center" }}>
            {activeIndex + 1}/{PROMO_PARTNERS.length}
          </span>
          <button type="button" onClick={goPrevious} aria-label="Previous partner promotion" style={SMALL_CONTROL_STYLE}>
            <ChevronLeft size={15} />
          </button>
          <button type="button" onClick={goNext} aria-label="Next partner promotion" style={SMALL_CONTROL_STYLE}>
            <ChevronRight size={15} />
          </button>

          <a
            href={partnerUrl}
            {...linkAttrs}
            aria-label={`View ${partner.shortCta}: ${partner.cta} — paid link`}
            style={{
              background: accentColor,
              color: partner.textColor || "#ffffff",
              fontWeight: 700,
              padding: "4px 12px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "12px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: `0 0 12px color-mix(in srgb, ${accentColor} 30%, transparent)`,
            }}
          >
            <ExternalLink size={14} />
            {`View ${partner.shortCta} →`}
          </a>

          <button type="button" onClick={handleDismiss} aria-label="Dismiss partner promotion banner" style={SMALL_CONTROL_STYLE}>
            <X size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
