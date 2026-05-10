"use client";

import { useEffect } from "react";
import { normalizeAnalyticsText, trackEvent } from "@/lib/analytics";

const CLICK_SELECTOR = "a,button,[role='button']";

function getClickableElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(CLICK_SELECTOR) : null;
}

function getLinkDetails(element: HTMLElement): { href?: string; outbound?: boolean; linkDomain?: string } {
  const href = element instanceof HTMLAnchorElement ? element.href : element.getAttribute("href") || undefined;
  if (!href || typeof window === "undefined") return {};

  try {
    const url = new URL(href, window.location.href);
    return {
      href: url.href,
      outbound: url.origin !== window.location.origin,
      linkDomain: url.hostname,
    };
  } catch {
    return { href };
  }
}

export function ClickAnalytics() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const element = getClickableElement(event.target);
      if (!element) return;

      const { href, outbound, linkDomain } = getLinkDetails(element);
      const clickId =
        element.dataset.analyticsId ||
        element.id ||
        element.getAttribute("aria-label") ||
        element.getAttribute("name") ||
        undefined;
      const clickText = element.dataset.analyticsLabel || normalizeAnalyticsText(element.textContent);

      trackEvent("ui_click", {
        element_type: element.tagName.toLowerCase(),
        click_id: normalizeAnalyticsText(clickId, 80),
        click_text: normalizeAnalyticsText(clickText, 100),
        link_url: normalizeAnalyticsText(href, 160),
        link_domain: normalizeAnalyticsText(linkDomain, 80),
        outbound,
        page_path: window.location.pathname,
      });
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  return null;
}
