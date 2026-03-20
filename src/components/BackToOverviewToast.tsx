"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

export function BackToOverviewToast() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);

  // Check if we are on a subpage (e.g. /[token]/price-prediction or /[token]/how-to-buy)
  // And NOT on the root /compare or /contact pages
  const isSubpage = Boolean(
    pathname &&
    pathname.split("/").length > 2 &&
    !pathname.startsWith("/compare")
  );

  useEffect(() => {
    // Only animate in after mount to prevent hydration mismatch
    const timeout = setTimeout(() => {
      setIsVisible(isSubpage);
    }, 50);
    return () => clearTimeout(timeout);
  }, [isSubpage]);

  if (!isVisible) return null;

  // Extract the token slug from the URL (e.g. /bitcoin/price-prediction -> bitcoin)
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  
  const tokenSlug = segments[0];

  return (
    <div className="back-toast-container animate-in">
      <Link href={`/${tokenSlug}`} className="back-toast-btn">
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
