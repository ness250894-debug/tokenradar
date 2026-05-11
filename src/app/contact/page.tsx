"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { JsonLd } from "@/components/JsonLd";
import { EmailIcon, InstagramIcon, TelegramIcon, ThreadsIcon, TikTokIcon, XIcon } from "@/components/SocialIcons";
import { CONTACT_EMAIL, CONTACT_FORM_ENDPOINT, SITE_URL, SOCIAL } from "@/lib/config";
import { trackEvent } from "@/lib/analytics";

type FormStatus = "idle" | "sending" | "success" | "error";

const SUBJECT_OPTIONS = [
  {
    value: "data-correction",
    label: "Data correction",
    detail: "Include the token name, page URL, incorrect field, and the source we should verify.",
    placeholder: "Token name, page URL, incorrect data, and a source link...",
  },
  {
    value: "bug-report",
    label: "Bug report",
    detail: "Tell us the page, device, browser, and what you expected to happen.",
    placeholder: "Page URL, browser/device, what happened, and expected behavior...",
  },
  {
    value: "partnership",
    label: "Partnership / advertising",
    detail: "Share the company, campaign type, target market, and timing.",
    placeholder: "Company, offer, timing, target audience, and relevant links...",
  },
  {
    value: "feedback",
    label: "Product feedback",
    detail: "Send research workflow ideas, missing pages, or usability feedback.",
    placeholder: "What should TokenRadar improve or add?",
  },
  {
    value: "general",
    label: "General inquiry",
    detail: "Use this for questions that do not fit the other categories.",
    placeholder: "How can we help?",
  },
] as const;

type SubjectValue = (typeof SUBJECT_OPTIONS)[number]["value"];

const CONTACT_LINKS = [
  {
    label: "Email",
    href: `mailto:${CONTACT_EMAIL}`,
    text: CONTACT_EMAIL,
    detail: "Best fallback if the form is unavailable.",
    Icon: EmailIcon,
  },
  {
    label: "X",
    href: SOCIAL.xUrl,
    text: "@TokenRadarCo",
    detail: "Market updates and public replies.",
    Icon: XIcon,
  },
  {
    label: "Telegram",
    href: SOCIAL.telegramUrl,
    text: "@TokenRadarCo",
    detail: "Fastest public channel for active readers.",
    Icon: TelegramIcon,
  },
  {
    label: "Threads",
    href: SOCIAL.threadsUrl,
    text: "@tokenradarco",
    detail: "Short-form discussion and feedback.",
    Icon: ThreadsIcon,
  },
  {
    label: "Instagram",
    href: SOCIAL.instagramUrl,
    text: "@tokenradarco",
    detail: "Visual updates and research snippets.",
    Icon: InstagramIcon,
  },
  {
    label: "TikTok",
    href: SOCIAL.tiktokUrl,
    text: "@tokenradarco",
    detail: "Short video updates and market explainers.",
    Icon: TikTokIcon,
  },
] as const;

const contactPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact TokenRadar",
  url: `${SITE_URL}/contact`,
  description: "Contact TokenRadar for data corrections, bug reports, feedback, partnerships, and support.",
  mainEntity: {
    "@type": "Organization",
    name: "TokenRadar",
    url: SITE_URL,
    email: CONTACT_EMAIL,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "data corrections",
        email: CONTACT_EMAIL,
        url: `${SITE_URL}/contact`,
        availableLanguage: "en",
      },
      {
        "@type": "ContactPoint",
        contactType: "partnerships",
        email: CONTACT_EMAIL,
        url: `${SITE_URL}/contact`,
        availableLanguage: "en",
      },
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: CONTACT_EMAIL,
        url: `${SITE_URL}/contact`,
        availableLanguage: "en",
      },
    ],
  },
};

export default function ContactPage() {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "data-correction" as SubjectValue,
    message: "",
  });

  const selectedSubject =
    SUBJECT_OPTIONS.find((option) => option.value === formData.subject) ?? SUBJECT_OPTIONS[0];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nativeFormData = new FormData(event.currentTarget);
    const botTrap = String(nativeFormData.get("_gotcha") || "").trim();

    if (botTrap) {
      setStatus("success");
      setStatusMessage("Thanks. Your message has been received.");
      return;
    }

    const payload = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      subject: selectedSubject.label,
      subjectKey: formData.subject,
      message: formData.message.trim(),
      source: "contact-page",
      _subject: `TokenRadar contact: ${selectedSubject.label}`,
      _replyto: formData.email.trim(),
    };

    trackEvent("contact_submit_started", {
      contact_subject: formData.subject,
      page_path: "/contact",
    });

    if (!CONTACT_FORM_ENDPOINT) {
      const body = [
        `Name: ${payload.name}`,
        `Email: ${payload.email}`,
        `Subject: ${payload.subject}`,
        "",
        payload.message,
      ].join("\n");

      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(payload._subject)}&body=${encodeURIComponent(body)}`;
      setStatus("success");
      setStatusMessage("Your email app should open with a prepared message.");
      trackEvent("contact_mailto_opened", {
        contact_subject: formData.subject,
        page_path: "/contact",
      });
      return;
    }

    setStatus("sending");
    setStatusMessage("");

    try {
      const response = await fetch(CONTACT_FORM_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setStatus("success");
        setStatusMessage("Message sent. We typically respond within 24-48 hours.");
        setFormData({ name: "", email: "", subject: "data-correction", message: "" });
        trackEvent("contact_submit_success", {
          contact_subject: payload.subjectKey,
          page_path: "/contact",
        });
        return;
      }

      setStatus("error");
      setStatusMessage(`We could not send the form. Please email ${CONTACT_EMAIL} directly.`);
      trackEvent("contact_submit_error", {
        contact_subject: payload.subjectKey,
        page_path: "/contact",
      });
    } catch {
      setStatus("error");
      setStatusMessage(`Network error. Please email ${CONTACT_EMAIL} directly.`);
      trackEvent("contact_submit_error", {
        contact_subject: payload.subjectKey,
        page_path: "/contact",
      });
    }
  };

  const isSending = status === "sending";

  return (
    <>
      <JsonLd id="contact-page-jsonld" data={contactPageJsonLd} />
      <div className="container">
        <section className="section">
          <div style={pageShellStyle}>
            <header style={headerStyle}>
              <p style={eyebrowStyle}>Support desk</p>
              <h1 style={headingStyle}>
                Contact <span className="gradient-text">TokenRadar</span>
              </h1>
              <p style={introStyle}>
                Report a data issue, send product feedback, or reach us about partnerships. Clear context helps us route the message and verify market data faster.
              </p>
            </header>

            <div style={primaryGridStyle}>
              <form
                id="contact-form"
                onSubmit={handleSubmit}
                aria-describedby="contact-form-help contact-privacy-note"
                style={panelStyle}
              >
                <div style={sectionHeadingRowStyle}>
                  <h2 style={panelHeadingStyle}>Send a message</h2>
                  <span style={responseBadgeStyle}>24-48h reply target</span>
                </div>
                <p id="contact-form-help" style={helperTextStyle}>
                  Fields marked required must be completed. For data corrections, include source links and the exact page or token.
                </p>

                <input
                  aria-hidden="true"
                  id="contact-gotcha"
                  name="_gotcha"
                  tabIndex={-1}
                  autoComplete="off"
                  style={honeypotStyle}
                />

                <div style={fieldGridStyle}>
                  <div>
                    <label htmlFor="contact-name" style={labelStyle}>
                      Name <span style={requiredStyle}>required</span>
                    </label>
                    <input
                      id="contact-name"
                      name="name"
                      type="text"
                      required
                      autoComplete="name"
                      maxLength={80}
                      value={formData.name}
                      onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                      placeholder="Your name"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" style={labelStyle}>
                      Email <span style={requiredStyle}>required</span>
                    </label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      maxLength={120}
                      value={formData.email}
                      onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                      placeholder="you@example.com"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={fieldBlockStyle}>
                  <label htmlFor="contact-subject" style={labelStyle}>Topic</label>
                  <select
                    id="contact-subject"
                    name="subject"
                    value={formData.subject}
                    onChange={(event) =>
                      setFormData({ ...formData, subject: event.target.value as SubjectValue })
                    }
                    aria-describedby="contact-subject-help"
                    style={selectStyle}
                  >
                    {SUBJECT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p id="contact-subject-help" style={fieldHelpStyle}>
                    {selectedSubject.detail}
                  </p>
                </div>

                <div style={fieldBlockStyle}>
                  <label htmlFor="contact-message" style={labelStyle}>
                    Message <span style={requiredStyle}>required</span>
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    minLength={12}
                    maxLength={3000}
                    rows={7}
                    value={formData.message}
                    onChange={(event) => setFormData({ ...formData, message: event.target.value })}
                    placeholder={selectedSubject.placeholder}
                    aria-describedby="contact-message-help"
                    style={{ ...inputStyle, minHeight: 188, resize: "vertical" }}
                  />
                  <p id="contact-message-help" style={fieldHelpStyle}>
                    Do not send private keys, seed phrases, exchange logins, or sensitive financial information.
                  </p>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSending}
                  id="contact-submit"
                  data-analytics-id="contact-submit"
                  data-analytics-label={selectedSubject.label}
                  style={submitStyle}
                >
                  {isSending ? "Sending..." : "Send Message"}
                </button>

                {statusMessage && (
                  <div
                    id="contact-status"
                    role={status === "error" ? "alert" : "status"}
                    aria-live={status === "error" ? "assertive" : "polite"}
                    style={status === "error" ? errorStyle : successStyle}
                  >
                    {statusMessage}
                  </div>
                )}

                <p id="contact-privacy-note" style={privacyNoteStyle}>
                  By submitting this form, you send your name, email, topic, and message to Formspree so TokenRadar can receive and respond to your inquiry. See our{" "}
                  <Link href="/privacy" style={inlineLinkStyle}>Privacy Policy</Link>.
                </p>
              </form>

              <aside style={asideStyle} aria-label="Contact details">
                <div style={miniPanelStyle}>
                  <h2 style={asideHeadingStyle}>Route it faster</h2>
                  <ul style={checkListStyle}>
                    <li><strong>Data correction:</strong> token name, page URL, wrong value, source link.</li>
                    <li><strong>Bug report:</strong> device, browser, page URL, expected result.</li>
                    <li><strong>Partnership:</strong> company, offer, timing, and compliance constraints.</li>
                  </ul>
                </div>

                <div style={miniPanelStyle}>
                  <h2 style={asideHeadingStyle}>Contact options</h2>
                  <div style={contactListStyle}>
                    {CONTACT_LINKS.map(({ label, href, text, detail, Icon }) => (
                      <a
                        key={href}
                        href={href}
                        target={href.startsWith("mailto:") ? undefined : "_blank"}
                        rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                        style={contactLinkStyle}
                        data-analytics-id={`contact-${label.toLowerCase()}`}
                      >
                        <span style={contactIconStyle} aria-hidden="true">
                          <Icon size={18} />
                        </span>
                        <span>
                          <span style={contactLabelStyle}>{label}</span>
                          <span style={contactTextStyle}>{text}</span>
                          <span style={contactDetailStyle}>{detail}</span>
                        </span>
                      </a>
                    ))}
                  </div>
                </div>

                <div style={noticeStyle}>
                  <strong>Security note:</strong> TokenRadar will never ask for seed phrases, private keys, wallet approvals, or exchange passwords.
                </div>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

const pageShellStyle: React.CSSProperties = {
  maxWidth: 1040,
  margin: "0 auto",
};

const headerStyle: React.CSSProperties = {
  maxWidth: 760,
  marginBottom: "var(--space-xl)",
};

const eyebrowStyle: React.CSSProperties = {
  marginBottom: "var(--space-xs)",
  color: "var(--accent-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-xs)",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--text-4xl)",
  lineHeight: 1.05,
  fontWeight: 800,
};

const introStyle: React.CSSProperties = {
  marginTop: "var(--space-md)",
  color: "var(--text-secondary)",
  fontSize: "var(--text-lg)",
  lineHeight: 1.65,
};

const primaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
  gap: "var(--space-xl)",
  alignItems: "start",
};

const panelStyle: React.CSSProperties = {
  padding: "var(--space-xl)",
  background: "var(--bg-card)",
  border: "1px solid var(--border-color)",
  borderRadius: 8,
  boxShadow: "var(--shadow-md)",
};

const sectionHeadingRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--space-md)",
  alignItems: "center",
  flexWrap: "wrap",
};

const panelHeadingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--text-2xl)",
  lineHeight: 1.2,
};

const responseBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "0 var(--space-sm)",
  border: "1px solid rgba(0, 255, 163, 0.26)",
  borderRadius: 6,
  color: "var(--green)",
  background: "rgba(0, 255, 163, 0.08)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-xs)",
  fontWeight: 700,
};

const helperTextStyle: React.CSSProperties = {
  marginTop: "var(--space-sm)",
  marginBottom: "var(--space-lg)",
  color: "var(--text-muted)",
  fontSize: "var(--text-sm)",
  lineHeight: 1.6,
};

const fieldGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
  gap: "var(--space-md)",
  marginBottom: "var(--space-md)",
};

const fieldBlockStyle: React.CSSProperties = {
  marginBottom: "var(--space-md)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--text-xs)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
  marginBottom: "var(--space-xs)",
};

const requiredStyle: React.CSSProperties = {
  color: "var(--accent-primary)",
  fontWeight: 700,
  textTransform: "none",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--space-sm) var(--space-md)",
  background: "rgba(7, 8, 11, 0.72)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: "var(--text-base)",
  fontFamily: "inherit",
  outline: "none",
};

const themedSelectArrow = [
  "linear-gradient(45deg, transparent 50%, var(--accent-primary) 50%)",
  "linear-gradient(135deg, var(--accent-primary) 50%, transparent 50%)",
].join(", ");

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
  backgroundColor: "rgba(7, 8, 11, 0.72)",
  backgroundImage: themedSelectArrow,
  backgroundPosition: "calc(100% - 21px) calc(50% + 1px), calc(100% - 15px) calc(50% + 1px)",
  backgroundRepeat: "no-repeat",
  backgroundSize: "6px 6px, 6px 6px",
  cursor: "pointer",
  paddingRight: "48px",
};

const fieldHelpStyle: React.CSSProperties = {
  marginTop: "var(--space-xs)",
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
  lineHeight: 1.6,
};

const submitStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  marginTop: "var(--space-xs)",
  padding: "var(--space-md)",
};

const successStyle: React.CSSProperties = {
  marginTop: "var(--space-md)",
  padding: "var(--space-md)",
  background: "rgba(0, 255, 163, 0.1)",
  border: "1px solid rgba(0, 255, 163, 0.32)",
  borderRadius: 6,
  color: "var(--green)",
  textAlign: "center",
  fontSize: "var(--text-sm)",
};

const errorStyle: React.CSSProperties = {
  ...successStyle,
  background: "rgba(255, 51, 102, 0.1)",
  border: "1px solid rgba(255, 51, 102, 0.35)",
  color: "var(--red)",
};

const privacyNoteStyle: React.CSSProperties = {
  marginTop: "var(--space-md)",
  marginBottom: 0,
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
  lineHeight: 1.6,
};

const inlineLinkStyle: React.CSSProperties = {
  color: "var(--accent-secondary)",
  fontWeight: 700,
};

const asideStyle: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-md)",
};

const miniPanelStyle: React.CSSProperties = {
  padding: "var(--space-lg)",
  background: "rgba(20, 20, 20, 0.72)",
  border: "1px solid var(--border-color)",
  borderRadius: 8,
};

const asideHeadingStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: "var(--space-md)",
  fontSize: "var(--text-lg)",
  lineHeight: 1.25,
};

const checkListStyle: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-sm)",
  margin: 0,
  paddingLeft: "var(--space-lg)",
  color: "var(--text-secondary)",
  fontSize: "var(--text-sm)",
  lineHeight: 1.6,
};

const contactListStyle: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-sm)",
};

const contactLinkStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "32px minmax(0, 1fr)",
  gap: "var(--space-sm)",
  alignItems: "start",
  padding: "var(--space-sm)",
  border: "1px solid rgba(204, 255, 0, 0.1)",
  borderRadius: 6,
  color: "inherit",
  background: "rgba(7, 8, 11, 0.35)",
};

const contactIconStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  color: "var(--accent-secondary)",
};

const contactLabelStyle: React.CSSProperties = {
  display: "block",
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-xs)",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const contactTextStyle: React.CSSProperties = {
  display: "block",
  color: "var(--accent-secondary)",
  fontSize: "var(--text-sm)",
  fontWeight: 700,
  overflowWrap: "anywhere",
};

const contactDetailStyle: React.CSSProperties = {
  display: "block",
  marginTop: "var(--space-2xs)",
  color: "var(--text-muted)",
  fontSize: "var(--text-xs)",
  lineHeight: 1.45,
};

const noticeStyle: React.CSSProperties = {
  padding: "var(--space-md)",
  background: "rgba(255, 184, 0, 0.08)",
  border: "1px solid rgba(255, 184, 0, 0.22)",
  borderRadius: 8,
  color: "var(--text-secondary)",
  fontSize: "var(--text-sm)",
  lineHeight: 1.6,
};

const honeypotStyle: React.CSSProperties = {
  position: "absolute",
  left: "-10000px",
  top: "auto",
  width: 1,
  height: 1,
  overflow: "hidden",
};
