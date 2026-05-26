export const ANALYTICS_CONSENT_KEY = "tokenradar-analytics-consent";
export const ANALYTICS_CONSENT_ACCEPTED = "accepted";
export const ANALYTICS_CONSENT_REJECTED = "rejected";

type ConsentValue = "granted" | "denied";
type Gtag = (...args: unknown[]) => void;
type GoogleAnalyticsCommand = [string, ...unknown[]];
type GoogleAnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: Gtag;
} & Record<`ga-disable-${string}`, boolean | undefined>;

const DEFAULT_CONSENT = {
  ad_personalization: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  analytics_storage: "denied",
  wait_for_update: 500,
} as const;

const CONFIG_PARAMS = {
  anonymize_ip: true,
  send_page_view: true,
} as const;

export function sanitizeGoogleAnalyticsMeasurementId(value: string | null | undefined): string {
  const normalized = (value || "").trim().toUpperCase();
  return normalized.match(/G-[A-Z0-9]+/)?.[0] ?? "";
}

export function isValidGoogleAnalyticsMeasurementId(value: string): boolean {
  return /^G-[A-Z0-9]{6,}$/.test(value);
}

export function buildGoogleAnalyticsScriptUrl(measurementId: string): string {
  const sanitized = sanitizeGoogleAnalyticsMeasurementId(measurementId);
  if (!isValidGoogleAnalyticsMeasurementId(sanitized)) return "";

  return `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(sanitized)}`;
}

export function getGoogleAnalyticsBootstrapCommands(measurementId: string): GoogleAnalyticsCommand[] {
  const sanitized = sanitizeGoogleAnalyticsMeasurementId(measurementId);
  if (!isValidGoogleAnalyticsMeasurementId(sanitized)) return [];

  return [
    ["consent", "default", DEFAULT_CONSENT],
    ["js", new Date()],
    ["config", sanitized, CONFIG_PARAMS],
  ];
}

export function getGoogleAnalyticsBootstrapScript(measurementId: string): string {
  const sanitized = sanitizeGoogleAnalyticsMeasurementId(measurementId);
  const scriptUrl = buildGoogleAnalyticsScriptUrl(sanitized);
  if (!scriptUrl) return "";

  return `
(function () {
  var measurementId = ${JSON.stringify(sanitized)};
  var scriptUrl = ${JSON.stringify(scriptUrl)};
  var consentKey = ${JSON.stringify(ANALYTICS_CONSENT_KEY)};
  var accepted = ${JSON.stringify(ANALYTICS_CONSENT_ACCEPTED)};
  var rejected = ${JSON.stringify(ANALYTICS_CONSENT_REJECTED)};
  var savedConsent = null;

  try {
    savedConsent = window.localStorage ? window.localStorage.getItem(consentKey) : null;
  } catch (error) {
    savedConsent = null;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("consent", "default", {
    ad_personalization: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    analytics_storage: savedConsent === accepted ? "granted" : "denied",
    wait_for_update: 500
  });

  if (savedConsent === rejected) {
    window["ga-disable-" + measurementId] = true;
    return;
  }

  window["ga-disable-" + measurementId] = false;
  window.gtag("js", new Date());
  window.gtag("config", measurementId, ${JSON.stringify(CONFIG_PARAMS)});

  if (document.querySelector('script[data-tokenradar-ga="' + measurementId + '"]')) {
    return;
  }

  var tag = document.createElement("script");
  tag.async = true;
  tag.src = scriptUrl;
  tag.dataset.tokenradarGa = measurementId;
  document.head.appendChild(tag);
}());
`.trim();
}

export function hasAcceptedGoogleAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage?.getItem(ANALYTICS_CONSENT_KEY) === ANALYTICS_CONSENT_ACCEPTED;
  } catch {
    return false;
  }
}

export function getSavedGoogleAnalyticsConsent(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage?.getItem(ANALYTICS_CONSENT_KEY) ?? null;
  } catch {
    return null;
  }
}

export function grantGoogleAnalyticsConsent(measurementId: string): boolean {
  const sanitized = sanitizeGoogleAnalyticsMeasurementId(measurementId);
  if (!isValidGoogleAnalyticsMeasurementId(sanitized)) return false;

  const win = getGoogleAnalyticsWindow();
  const gtag = ensureGoogleAnalyticsGtag();
  if (!win || !gtag) return false;

  win[`ga-disable-${sanitized}`] = false;
  updateGoogleAnalyticsConsent("granted");
  ensureGoogleAnalyticsTag(sanitized);
  return true;
}

export function denyGoogleAnalyticsConsent(measurementId: string): boolean {
  const sanitized = sanitizeGoogleAnalyticsMeasurementId(measurementId);
  const win = getGoogleAnalyticsWindow();

  if (win && isValidGoogleAnalyticsMeasurementId(sanitized)) {
    win[`ga-disable-${sanitized}`] = true;
  }

  return updateGoogleAnalyticsConsent("denied");
}

function updateGoogleAnalyticsConsent(value: ConsentValue): boolean {
  const gtag = ensureGoogleAnalyticsGtag();
  if (!gtag) return false;

  gtag("consent", "update", {
    ad_personalization: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    analytics_storage: value,
  });
  return true;
}

function ensureGoogleAnalyticsGtag(): Gtag | null {
  const win = getGoogleAnalyticsWindow();
  if (!win) return null;

  win.dataLayer = win.dataLayer || [];
  win.gtag = win.gtag || function gtag(...args: unknown[]) {
    win.dataLayer?.push(args);
  };
  return win.gtag;
}

function ensureGoogleAnalyticsTag(measurementId: string): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`script[data-tokenradar-ga="${measurementId}"]`)) return;

  const scriptUrl = buildGoogleAnalyticsScriptUrl(measurementId);
  if (!scriptUrl) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = scriptUrl;
  script.dataset.tokenradarGa = measurementId;
  document.head.appendChild(script);
}

function getGoogleAnalyticsWindow(): GoogleAnalyticsWindow | null {
  if (typeof window === "undefined") return null;
  return window as unknown as GoogleAnalyticsWindow;
}
