"use client";

import { useState, type FormEvent } from "react";
import type { Metadata } from "next";

/**
 * Contact page — E-E-A-T signal with a functional contact form.
 * Uses a client component for form state.
 * Since this is a static export, submissions are handled client-side
 * via a configurable endpoint (Formspree, Web3Forms, etc.).
 */

const FORM_ENDPOINT = "https://formspree.io/f/mnjgzrjr";

type FormStatus = "idle" | "sending" | "success" | "error";

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
              <div style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-sm)" }}>📧</div>
              <div className="stat-label">Email</div>
              <a
                href="mailto:contact@tokenradar.co"
                style={{ color: "var(--accent-secondary)", fontSize: "var(--text-sm)" }}
              >
                contact@tokenradar.co
              </a>
            </div>
            <div className="stat-card">
              <div style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-sm)" }}>🐦</div>
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
              <div style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-sm)" }}>💬</div>
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
