import Image from "next/image";
import { ShieldCheck, Sparkles, Tag, CheckCircle2 } from "lucide-react";
import { getPartner, getPartnerLinkAttributes } from "@/lib/partners";

export function HomeTangemPromoCard() {
  const tangem = getPartner("tangem");
  if (!tangem) return null;

  const linkAttrs = getPartnerLinkAttributes(tangem, "homepage-inline-card");

  return (
    <section className="section" style={{ padding: "var(--space-md) 0" }}>
      <div className="container">
        <div
          style={{
            background: "linear-gradient(135deg, rgba(0, 153, 255, 0.08) 0%, rgba(15, 23, 42, 0.8) 100%)",
            border: "1px solid rgba(0, 153, 255, 0.25)",
            borderRadius: "var(--radius-xl, 16px)",
            padding: "var(--space-lg)",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
          }}
        >
          {/* Subtle accent glow */}
          <div
            style={{
              position: "absolute",
              top: "-50px",
              right: "-50px",
              width: "200px",
              height: "200px",
              background: "radial-gradient(circle, rgba(0, 153, 255, 0.2) 0%, transparent 70%)",
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
            {/* Left: Product Image */}
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "200px",
                borderRadius: "var(--radius-lg, 12px)",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <Image
                src="/images/tangem-og.jpg"
                alt="Tangem Hardware Wallet and Ring"
                fill
                style={{ objectFit: "cover" }}
                sizes="(max-width: 768px) 100vw, 400px"
              />
              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  left: "12px",
                  background: "rgba(10, 14, 26, 0.85)",
                  backdropFilter: "blur(6px)",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#60a5fa",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  border: "1px solid rgba(0, 153, 255, 0.3)",
                }}
              >
                <Sparkles size={12} /> Partner Spotlight
              </div>
            </div>

            {/* Right: Promotion Details & CTA */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                <span
                  style={{
                    background: "#0099FF",
                    color: "#fff",
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
                  <Tag size={12} /> 10% Discount
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Hardware Security
                </span>
              </div>

              <h2 style={{ fontSize: "var(--text-xl, 22px)", fontWeight: 700, marginBottom: "8px", color: "#fff" }}>
                Tangem Wallet, Ring & Pay
              </h2>

              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm, 14px)", lineHeight: 1.6, marginBottom: "16px" }}>
                Next-gen NFC hardware wallet built into cards and rings. Features EAL6+ Secure Element, multi-card physical backup, seedless setup, and direct Visa payments.
              </p>

              <div
                style={{
                  background: "rgba(0, 153, 255, 0.1)",
                  border: "1px dashed rgba(0, 153, 255, 0.35)",
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
                    Use discount code at checkout:
                  </div>
                  <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontWeight: 800, fontSize: "16px", color: "#60a5fa" }}>
                    TOKENRADAR
                  </div>
                </div>

                <div style={{ fontSize: "12px", color: "var(--green, #10b981)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                  <CheckCircle2 size={14} /> Auto-applied via link
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <a
                  href={tangem.url}
                  {...linkAttrs}
                  className="btn"
                  style={{
                    background: "#0099FF",
                    color: "#ffffff",
                    fontWeight: 700,
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 4px 14px rgba(0, 153, 255, 0.35)",
                  }}
                >
                  <ShieldCheck size={16} />
                  Get 10% Off at Tangem &rarr;
                </a>

                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Paid link: TokenRadar may earn a commission.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
