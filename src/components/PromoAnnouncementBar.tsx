"use client";

import { useState, useEffect } from "react";
import { X, ShieldCheck, Tag } from "lucide-react";
import { getPartner, getPartnerLinkAttributes } from "@/lib/partners";

const STORAGE_KEY = "tangem_promo_bar_dismissed_v1";

export function PromoAnnouncementBar() {
  const [dismissed, setDismissed] = useState(true); // default true to avoid flash before hydration

  useEffect(() => {
    try {
      const isDismissed = localStorage.getItem(STORAGE_KEY) === "true";
      setDismissed(isDismissed);
    } catch {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch (e) {
      console.error(e);
    }
  };

  if (dismissed) return null;

  const tangem = getPartner("tangem");
  if (!tangem) return null;

  const linkAttrs = getPartnerLinkAttributes(tangem, "top-announcement-bar");

  return (
    <aside
      aria-label="Partner promotion"
      style={{
        background: "linear-gradient(90deg, rgba(0, 153, 255, 0.15) 0%, rgba(16, 24, 40, 0.95) 50%, rgba(0, 153, 255, 0.15) 100%)",
        borderBottom: "1px solid rgba(0, 153, 255, 0.3)",
        color: "var(--text-primary, #ffffff)",
        fontSize: "13px",
        padding: "8px 16px",
        position: "relative",
        zIndex: 101,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 auto", flexWrap: "wrap" }}>
          <span
            style={{
              background: "#0099FF",
              color: "#ffffff",
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
            <Tag size={10} /> 10% OFF
          </span>
          <span style={{ fontWeight: 500, color: "var(--text-secondary, #e2e8f0)" }}>
            Exclusive discount on <strong>Tangem Wallet & Ring</strong> with code{" "}
            <code
              style={{
                background: "rgba(0, 153, 255, 0.2)",
                color: "#60a5fa",
                padding: "1px 5px",
                borderRadius: "3px",
                fontFamily: "var(--font-jetbrains, monospace)",
                fontWeight: 700,
                border: "1px solid rgba(0, 153, 255, 0.4)",
              }}
            >
              TOKENRADAR
            </code>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          <a
            href={tangem.url}
            {...linkAttrs}
            style={{
              background: "#0099FF",
              color: "#ffffff",
              fontWeight: 700,
              padding: "4px 12px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "12px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              boxShadow: "0 0 12px rgba(0, 153, 255, 0.3)",
              transition: "transform 0.15s ease, background 0.15s ease",
            }}
          >
            <ShieldCheck size={14} />
            Claim 10% Off &rarr;
          </a>

          <button
            onClick={handleDismiss}
            aria-label="Dismiss promotion banner"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted, #94a3b8)",
              cursor: "pointer",
              padding: "4px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
              transition: "color 0.15s ease",
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
