"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "tokenradar.pwaInstallDismissedAt";
const DISMISS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function wasRecentlyDismissed(): boolean {
  try {
    const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_WINDOW_MS;
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures; dismissal is a convenience only.
  }
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isCookieConsentVisible, setIsCookieConsentVisible] = useState(false);

  useEffect(() => {
    if (isStandaloneDisplay() || wasRecentlyDismissed()) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    const syncCookieConsentState = () => {
      setIsCookieConsentVisible(Boolean(document.querySelector(".cookie-consent")));
    };

    syncCookieConsentState();

    const observer = new MutationObserver(syncCookieConsentState);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "dismissed") {
      rememberDismissal();
    }
    setInstallEvent(null);
    setIsVisible(false);
  };

  const handleDismiss = () => {
    rememberDismissal();
    setIsVisible(false);
  };

  if (!isVisible || !installEvent || isCookieConsentVisible) return null;

  return (
    <div className="pwa-install-prompt" role="dialog" aria-label="Install TokenRadar app">
      <button className="pwa-install-main" type="button" onClick={handleInstall}>
        <Download size={16} aria-hidden="true" />
        <span>Install app</span>
      </button>
      <button className="pwa-install-dismiss" type="button" onClick={handleDismiss} aria-label="Dismiss install prompt">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
