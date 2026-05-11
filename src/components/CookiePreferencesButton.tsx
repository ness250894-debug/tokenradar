"use client";

import { useState } from "react";
import { ANALYTICS_CONSENT_KEY, ANALYTICS_CONSENT_REJECTED } from "./CookieConsent";

export function CookiePreferencesButton() {
  const [status, setStatus] = useState<string | null>(null);

  const rejectAnalytics = () => {
    const analyticsScript = document.querySelector<HTMLScriptElement>("script[data-tokenradar-ga]");
    const measurementId = analyticsScript?.dataset.tokenradarGa;
    if (measurementId) {
      const win = window as typeof window & Record<`ga-disable-${string}`, boolean>;
      win[`ga-disable-${measurementId}`] = true;
    }

    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, ANALYTICS_CONSENT_REJECTED);
    setStatus("Analytics cookies rejected for future visits and events. Browser controls can delete existing cookies.");
  };

  return (
    <div className="privacy-choice-box">
      <p>
        You can reject optional analytics cookies at any time. Browser controls
        can also delete cookies already stored on your device.
      </p>
      <button type="button" className="btn btn-secondary" onClick={rejectAnalytics}>
        Reject Analytics Cookies
      </button>
      {status && <p style={{ marginTop: "var(--space-sm)", color: "var(--text-muted)" }}>{status}</p>}
    </div>
  );
}
