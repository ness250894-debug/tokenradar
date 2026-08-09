"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getBrowserStorageItem, setBrowserStorageItem } from "@/lib/browser-storage";
import {
  ANALYTICS_CONSENT_ACCEPTED,
  ANALYTICS_CONSENT_KEY,
  ANALYTICS_CONSENT_REJECTED,
  denyGoogleAnalyticsConsent,
  grantGoogleAnalyticsConsent,
} from "@/lib/google-analytics";

export function CookieConsent({ measurementId }: { measurementId: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!measurementId) return;

    const savedConsent = getBrowserStorageItem(ANALYTICS_CONSENT_KEY);
    if (savedConsent === ANALYTICS_CONSENT_ACCEPTED) {
      grantGoogleAnalyticsConsent(measurementId);
      return;
    }

    if (savedConsent === ANALYTICS_CONSENT_REJECTED) {
      denyGoogleAnalyticsConsent(measurementId);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), 5000);
    return () => window.clearTimeout(timer);
  }, [measurementId]);

  const acceptAnalytics = useCallback(() => {
    setBrowserStorageItem(ANALYTICS_CONSENT_KEY, ANALYTICS_CONSENT_ACCEPTED);
    grantGoogleAnalyticsConsent(measurementId);
    setVisible(false);
  }, [measurementId]);

  const rejectAnalytics = useCallback(() => {
    setBrowserStorageItem(ANALYTICS_CONSENT_KEY, ANALYTICS_CONSENT_REJECTED);
    denyGoogleAnalyticsConsent(measurementId);
    setVisible(false);
  }, [measurementId]);

  if (!measurementId || !visible) return null;

  return (
    <div className="cookie-consent" role="dialog" aria-live="polite" aria-label="Analytics choices">
      <div>
        <strong>Analytics cookies</strong>
        <p>
          Optional analytics help improve research paths. Rejecting analytics
          does not limit site access.
        </p>
        <Link href="/privacy" prefetch={false}>Privacy Policy</Link>
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
