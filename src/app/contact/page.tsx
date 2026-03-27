"use client";

import { useState, type FormEvent } from "react";

/**
 * Contact page — E-E-A-T signal with a functional contact form.
 * Uses a client component for form state.
 * Since this is a static export, submissions are handled client-side
 * via a configurable endpoint (Formspree, Web3Forms, etc.).
 */

const FORM_ENDPOINT = "https://formspree.io/f/mnjgzrjr";

type FormStatus = "idle" | "sending" | "success" | "error";

/**
 * Official X (formerly Twitter) brand mark — the "𝕏" logo.
 * White fill for dark backgrounds, per brand guidelines.
 */
function XIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="white"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * Official Telegram brand mark — the paper plane logo.
 * White fill for dark backgrounds, per brand guidelines.
 */
function TelegramIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="white"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

/**
 * Simple email/envelope icon as inline SVG.
 */
function EmailIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export default function ContactPage() {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "general",
    message: "",
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!FORM_ENDPOINT) {
      // Fallback: open mailto link
      const mailtoUrl = `mailto:contact@tokenradar.co?subject=${encodeURIComponent(
        `[${formData.subject}] ${formData.name}`
      )}&body=${encodeURIComponent(formData.message)}`;
      window.open(mailtoUrl, "_blank");
      setStatus("success");
      return;
    }

    setStatus("sending");

    try {
      const response = await fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setStatus("success");
        setFormData({ name: "", email: "", subject: "general", message: "" });
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="container">
      <section className="section">
        <div className="article-content" style={{ maxWidth: 680, margin: "0 auto" }}>
          <h1>
            Contact <span className="gradient-text">TokenRadar</span>
          </h1>
          <p style={{ fontSize: "var(--text-lg)", marginTop: "var(--space-lg)", color: "var(--text-secondary)" }}>
            Have questions, feedback, or partnership inquiries?
            We&apos;d love to hear from you.
          </p>

          {/* Contact Info Cards */}
          <div className="stats-grid" style={{ marginTop: "var(--space-xl)", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            <div className="stat-card">
              <div style={{ marginBottom: "var(--space-sm)", display: "flex", justifyContent: "center" }}>
                <EmailIcon />
              </div>
              <div className="stat-label">Email</div>
              <a
                href="mailto:contact@tokenradar.co"
                style={{ color: "var(--accent-secondary)", fontSize: "var(--text-sm)" }}
              >
                contact@tokenradar.co
              </a>
            </div>
            <div className="stat-card">
              <div style={{ marginBottom: "var(--space-sm)", display: "flex", justifyContent: "center" }}>
                <XIcon />
              </div>
              <div className="stat-label">X (Twitter)</div>
              <a
                href="https://x.com/tokenradarco"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent-secondary)", fontSize: "var(--text-sm)" }}
              >
                @TokenRadarCo
              </a>
            </div>
            <div className="stat-card">
              <div style={{ marginBottom: "var(--space-sm)", display: "flex", justifyContent: "center" }}>
                <TelegramIcon />
              </div>
              <div className="stat-label">Telegram</div>
              <a
                href="https://t.me/TokenRadarCo"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent-secondary)", fontSize: "var(--text-sm)" }}
              >
                @TokenRadarCo
              </a>
            </div>
          </div>

          {/* Contact Form */}
          <form onSubmit={handleSubmit} style={{ marginTop: "var(--space-2xl)" }}>
            <h2 style={{ marginBottom: "var(--space-lg)" }}>
              Send a <span className="gradient-text">Message</span>
            </h2>

            <div style={{ display: "flex", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="contact-name" style={labelStyle}>Name *</label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your name"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="contact-email" style={labelStyle}>Email *</label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@example.com"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ marginBottom: "var(--space-md)" }}>
              <label htmlFor="contact-subject" style={labelStyle}>Subject</label>
              <select
                id="contact-subject"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                style={inputStyle}
              >
                <option value="general">General Inquiry</option>
                <option value="feedback">Feedback</option>
                <option value="partnership">Partnership / Advertising</option>
                <option value="correction">Data Correction</option>
                <option value="bug">Bug Report</option>
              </select>
            </div>

            <div style={{ marginBottom: "var(--space-lg)" }}>
              <label htmlFor="contact-message" style={labelStyle}>Message *</label>
              <textarea
                id="contact-message"
                required
                rows={6}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="How can we help?"
                style={{ ...inputStyle, resize: "vertical" as const }}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={status === "sending"}
              id="contact-submit"
              style={{ width: "100%", padding: "var(--space-md)" }}
            >
              {status === "sending" ? "Sending..." : "Send Message"}
            </button>

            {status === "success" && (
              <div style={{ marginTop: "var(--space-md)", padding: "var(--space-md)", background: "rgba(0, 230, 118, 0.1)", border: "1px solid rgba(0, 230, 118, 0.3)", borderRadius: "var(--radius-md)", color: "#00e676", textAlign: "center" }}>
                ✓ Message sent successfully! We&apos;ll get back to you soon.
              </div>
            )}
            {status === "error" && (
              <div style={{ marginTop: "var(--space-md)", padding: "var(--space-md)", background: "rgba(255, 82, 82, 0.1)", border: "1px solid rgba(255, 82, 82, 0.3)", borderRadius: "var(--radius-md)", color: "#ff5252", textAlign: "center" }}>
                ✗ Something went wrong. Please email us directly at contact@tokenradar.co
              </div>
            )}
          </form>

          {/* Response Time */}
          <div style={{ marginTop: "var(--space-xl)", padding: "var(--space-lg)", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            <strong>Response Time:</strong> We typically respond within 24-48 hours.
            For urgent data corrections, please include the token name and the specific issue in your message.
          </div>
        </div>
      </section>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
  marginBottom: "var(--space-xs)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--space-sm) var(--space-md)",
  background: "var(--bg-card)",
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-primary)",
  fontSize: "var(--text-base)",
  fontFamily: "inherit",
  outline: "none",
};
