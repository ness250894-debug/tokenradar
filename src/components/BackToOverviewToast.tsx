"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSyncExternalStore } from "react";

const SCROLL_THRESHOLD = 640;

function subscribeToScroll(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true });
  window.addEventListener("resize", callback, { passive: true });

  return () => {
    window.removeEventListener("scroll", callback);
    window.removeEventListener("resize", callback);
  };
}

function getScrollSnapshot() {
  return window.scrollY > SCROLL_THRESHOLD;
}

function getServerScrollSnapshot() {
  return false;
}

export function BackToOverviewToast() {
  const pathname = usePathname();
  const hasScrolledPastThreshold = useSyncExternalStore(
    subscribeToScroll,
    getScrollSnapshot,
    getServerScrollSnapshot
  );

  // Check if we are on a subpage (e.g. /[token]/price-prediction or /[token]/how-to-buy)
  // And NOT on the root /compare or /contact pages
  const isSubpage = Boolean(
    pathname &&
    pathname.split("/").length > 2 &&
    !pathname.startsWith("/upcoming")
  );

  if (!isSubpage || !hasScrolledPastThreshold) return null;

  // Extract the token slug from the URL (e.g. /bitcoin/price-prediction -> bitcoin)
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  
  const targetHref = `/${segments[0]}`;

  return (
    <div className="back-toast-container animate-in">
      <Link href={targetHref} className="back-toast-btn">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        <span>Back to Overview</span>
      </Link>
    </div>
  );
}
