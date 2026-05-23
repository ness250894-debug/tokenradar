import { getBrowserStorageItem, removeBrowserStorageItem, setBrowserStorageItem } from "./browser-storage";

type AnalyticsValue = string | number | boolean | undefined;
type AnalyticsParams = Record<string, AnalyticsValue>;
export interface LocalAnalyticsEvent {
  eventName: string;
  params: AnalyticsParams;
  occurredAt: string;
  pagePath?: string;
}

const LOCAL_ANALYTICS_KEY = "tokenradar.analytics.events";
const MAX_LOCAL_ANALYTICS_EVENTS = 100;
const ANALYTICS_CONSENT_KEY = "tokenradar-analytics-consent";
const ANALYTICS_CONSENT_ACCEPTED = "accepted";

declare global {
  interface Window {
    gtag?: (command: "event", eventName: string, params?: AnalyticsParams) => void;
  }
}

export function trackEvent(eventName: string, params: AnalyticsParams = {}): void {
  if (typeof window === "undefined") return;

  const cleanedParams = cleanAnalyticsParams(params);

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, cleanedParams);
  }

  if (shouldStoreLocalAnalytics()) {
    try {
      const existing = JSON.parse(getBrowserStorageItem(LOCAL_ANALYTICS_KEY) || "[]") as LocalAnalyticsEvent[];
      const next = [
        {
          eventName,
          params: cleanedParams,
          occurredAt: new Date().toISOString(),
          pagePath: window.location.pathname,
        },
        ...existing,
      ].slice(0, MAX_LOCAL_ANALYTICS_EVENTS);
      setBrowserStorageItem(LOCAL_ANALYTICS_KEY, JSON.stringify(next));
    } catch {
      // Analytics must never block the UI.
    }
  }

  try {
    window.dispatchEvent(new CustomEvent("tokenradar:analytics", {
      detail: { eventName, params: cleanedParams },
    }));
  } catch {
    // CustomEvent can be unavailable in constrained test/browser contexts.
  }
}

export function cleanAnalyticsParams(params: AnalyticsParams): AnalyticsParams {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ""),
  ) as AnalyticsParams;
}

export function normalizeAnalyticsText(value: string | null | undefined, maxLength = 100): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function isLocalPreviewHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function shouldStoreLocalAnalytics(): boolean {
  if (typeof window === "undefined") return false;
  if (isLocalPreviewHost(window.location.hostname)) return true;

  return getBrowserStorageItem(ANALYTICS_CONSENT_KEY) === ANALYTICS_CONSENT_ACCEPTED;
}

export function getLocalAnalyticsEvents(): LocalAnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(getBrowserStorageItem(LOCAL_ANALYTICS_KEY) || "[]") as LocalAnalyticsEvent[];
  } catch {
    return [];
  }
}

export function clearLocalAnalyticsEvents(): void {
  if (typeof window === "undefined") return;
  try {
    removeBrowserStorageItem(LOCAL_ANALYTICS_KEY);
    window.dispatchEvent(new CustomEvent("tokenradar:analytics", {
      detail: { eventName: "local_analytics_clear", params: {} },
    }));
  } catch {
    // Local analytics inspection should never block the UI.
  }
}
