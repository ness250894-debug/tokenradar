"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const CONSENT_KEY = "tokenradar-analytics-consent";
const ACCEPTED = "accepted";
const REJECTED = "rejected";

function isValidMeasurementId(value: string): boolean {
  return /^[A-Z0-9-]+$/i.test(value);
}

function loadGoogleAnalytics(measurementId: string): void {
  if (!measurementId || !isValidMeasurementId(measurementId)) return;

  const win = window as typeof window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };

  if (document.querySelector(`script[data-tokenradar-ga="${measurementId}"]`)) {
    return;
  }

  win.dataLayer = win.dataLayer || [];
  win.gtag = win.gtag || function gtag(...args: unknown[]) {
    win.dataLayer?.push(args);
  };
  win.gtag("js", new Date());
  win.gtag("config", measurementId, {
    anonymize_ip: true,
    send_page_view: true,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.dataset.tokenradarGa = measurementId;
  document.head.appendChild(script);
}

export function CookieConsent({ measurementId }: { measurementId: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!measurementId) return;

    const savedConsent = window.localStorage.getItem(CONSENT_KEY);
    if (savedConsent === ACCEPTED) {
      loadGoogleAnalytics(measurementId);
      return;
    }

    if (savedConsent !== REJECTED) {
      const timer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [measurementId]);

  const acceptAnalytics = useCallback(() => {
    window.localStorage.setItem(CONSENT_KEY, ACCEPTED);
    loadGoogleAnalytics(measurementId);
    setVisible(false);
  }, [measurementId]);

  const rejectAnalytics = useCallback(() => {
    window.localStorage.setItem(CONSENT_KEY, REJECTED);
    setVisible(false);
  }, []);

  if (!measurementId || !visible) return null;

  return (
    <div className="cookie-consent" role="dialog" aria-live="polite" aria-label="Analytics choices">
      <div>
        <strong>Analytics cookies</strong>
        <p>
          TokenRadar uses optional analytics to understand traffic and improve
          disclosures. Rejecting analytics does not limit site access.
        </p>
        <Link href="/privacy">Privacy Policy</Link>
      </div>
      <div className="cookie-consent-actions">
        <button type="button" className="btn btn-secondary" onClick={rejectAnalytics}>
          Reject
        </button>
        <button type="button" className="btn btn-primary" onClick={acceptAnalytics}>
          Accept
        </button>
      </div>
    </div>
  );
}

export const ANALYTICS_CONSENT_KEY = CONSENT_KEY;
export const ANALYTICS_CONSENT_REJECTED = REJECTED;
