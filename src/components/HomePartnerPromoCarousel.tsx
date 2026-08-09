"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import {
  getHomepagePromoPartners,
  getPartnerLinkAttributes,
  getPartnerPlacementUrl,
} from "@/lib/partners";
import { usePartnerRotation } from "@/components/usePartnerRotation";

const HOME_PROMO_PARTNERS = getHomepagePromoPartners();

const CAROUSEL_CONTROL_STYLE: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "999px",
  border: "1px solid rgba(255, 255, 255, 0.16)",
  background: "rgba(10, 14, 26, 0.78)",
  color: "var(--text-primary)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

export function HomePartnerPromoCarousel() {
  const {
    activeIndex,
    goNext,
    goPrevious,
    goTo,
    isPlaying,
  } = usePartnerRotation(HOME_PROMO_PARTNERS.length, 1);
  const partner = HOME_PROMO_PARTNERS[activeIndex];

  if (!partner) return null;

  const placement = "homepage-inline-carousel";
  const partnerUrl = getPartnerPlacementUrl(partner, placement);
  const linkAttrs = getPartnerLinkAttributes(partner, placement);
  const isHardwareWallet = partner.category === "hardware-wallet";
  const CategoryIcon = isHardwareWallet ? ShieldCheck : ReceiptText;
  const categoryLabel = isHardwareWallet ? "Hardware wallet" : "Tax software";
  const accentColor = partner.color || "#0099FF";

  return (
    <section
      className="section"
      aria-label="Partner promotions"
      data-nosnippet
      style={{ padding: "var(--space-md) 0" }}
    >
      <div className="container">
        <div
          role="group"
          aria-roledescription="carousel"
          aria-label={`${partner.name}, promotion ${activeIndex + 1} of ${HOME_PROMO_PARTNERS.length}`}
          aria-live={isPlaying ? "off" : "polite"}
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${accentColor} 10%, transparent) 0%, rgba(15, 23, 42, 0.86) 100%)`,
            border: `1px solid color-mix(in srgb, ${accentColor} 34%, transparent)`,
            borderRadius: "var(--radius-xl, 16px)",
            padding: "var(--space-lg)",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: "-50px",
              right: "-50px",
              width: "200px",
              height: "200px",
              background: `radial-gradient(circle, color-mix(in srgb, ${accentColor} 22%, transparent) 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "var(--space-lg)",
              alignItems: "center",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "200px",
                borderRadius: "var(--radius-lg, 12px)",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                background: "#060910",
              }}
            >
              {partner.id === "tangem" ? (
                <Image
                  src="/images/tangem-og.jpg"
                  alt="Tangem hardware wallet and ring"
                  fill
                  style={{ objectFit: "contain" }}
                  sizes="(max-width: 768px) 100vw, 400px"
                />
              ) : (
                <div
                  style={{
                    height: "100%",
                    padding: "var(--space-lg)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    background: `linear-gradient(135deg, color-mix(in srgb, ${accentColor} 28%, #07080b), #07080b 72%)`,
                  }}
                >
                  <CategoryIcon size={42} color={accentColor} aria-hidden="true" />
                  <div>
                    <span style={{ color: "var(--text-muted)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {categoryLabel}
                    </span>
                    <div style={{ fontSize: "clamp(1.75rem, 5vw, 2.5rem)", fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
                      {partner.name}
                    </div>
                  </div>
                </div>
              )}

              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  left: "12px",
                  background: "rgba(10, 14, 26, 0.88)",
                  backdropFilter: "blur(6px)",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: accentColor,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  border: `1px solid color-mix(in srgb, ${accentColor} 38%, transparent)`,
                }}
              >
                <Sparkles size={12} /> Partner Spotlight
              </div>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                <span
                  style={{
                    background: accentColor,
                    color: partner.textColor || "#ffffff",
                    fontWeight: 800,
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Tag size={12} /> {partner.offer || categoryLabel}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {partner.availability.label}
                </span>
              </div>

              <h2 style={{ fontSize: "var(--text-xl, 22px)", fontWeight: 700, marginBottom: "8px", color: "#fff" }}>
                {partner.name}
              </h2>

              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm, 14px)", lineHeight: 1.6, marginBottom: "16px" }}>
                {partner.description}
              </p>

              <div
                style={{
                  background: `color-mix(in srgb, ${accentColor} 10%, transparent)`,
                  border: `1px dashed color-mix(in srgb, ${accentColor} 38%, transparent)`,
                  borderRadius: "var(--radius-md, 8px)",
                  padding: "10px 14px",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>
                    {partner.coupon ? "Promo code on partner site:" : "Before you continue:"}
                  </div>
                  <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 800, fontSize: "15px", color: accentColor }}>
                    {partner.coupon || partner.availability.label}
                  </div>
                </div>

                <div style={{ fontSize: "12px", color: "var(--green, #10b981)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 size={14} /> Check current terms
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <a
                  href={partnerUrl}
                  {...linkAttrs}
                  className="btn"
                  style={{
                    background: accentColor,
                    color: partner.textColor || "#ffffff",
                    fontWeight: 700,
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: `0 4px 14px color-mix(in srgb, ${accentColor} 35%, transparent)`,
                  }}
                >
                  <CategoryIcon size={16} />
                  {`${partner.cta} →`}
                </a>

                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {partner.disclosure}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              marginTop: "var(--space-lg)",
              paddingTop: "var(--space-md)",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <div aria-label="Choose a partner promotion" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {HOME_PROMO_PARTNERS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goTo(index)}
                  aria-label={`Show ${item.name} promotion`}
                  aria-pressed={index === activeIndex}
                  title={item.name}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "999px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: index === activeIndex ? "24px" : "9px",
                      height: "9px",
                      borderRadius: "999px",
                      background: index === activeIndex ? accentColor : "rgba(255, 255, 255, 0.25)",
                      transition: "width 180ms ease, background 180ms ease",
                    }}
                  />
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "12px", minWidth: "42px", textAlign: "center" }}>
                {activeIndex + 1} / {HOME_PROMO_PARTNERS.length}
              </span>
              <button type="button" onClick={goPrevious} aria-label="Previous partner promotion" style={CAROUSEL_CONTROL_STYLE}>
                <ChevronLeft size={18} />
              </button>
              <button type="button" onClick={goNext} aria-label="Next partner promotion" style={CAROUSEL_CONTROL_STYLE}>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
