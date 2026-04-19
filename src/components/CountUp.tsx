"use client";

import { useEffect, useState, useRef } from "react";

interface CountUpProps {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  compact?: boolean;
  className?: string;
}

/** Format a numeric value for display with compact notation and locale separators. */
function formatNumber(value: number, decimals: number, compact: boolean): string {
  if (compact) {
    if (value >= 1e12) return (value / 1e12).toFixed(2) + "T";
    if (value >= 1e9) return (value / 1e9).toFixed(2) + "B";
    if (value >= 1e6) return (value / 1e6).toFixed(2) + "M";
    if (value >= 1e3) return (value / 1e3).toFixed(2) + "K";
    return value.toFixed(2);
  }
  if (decimals === 0 && value >= 1000) {
    return Math.floor(value).toLocaleString("en-US");
  }
  return value.toFixed(decimals);
}

/**
 * Animated number counter that animates from 0 to end value on first viewport intersection.
 * 
 * CRITICAL: Uses `suppressHydrationWarning` because the server renders the final value
 * while the client starts at 0 for the animation effect. Without this, Cloudflare Edge
 * hydration mismatches cause the displayed value to freeze at $0.
 */
export function CountUp({
  end,
  duration = 1.5,
  prefix = "",
  suffix = "",
  decimals = 0,
  compact = false,
  className,
}: CountUpProps) {
  // Start with the final value to match SSR output and prevent flash of $0
  const [displayValue, setDisplayValue] = useState<string>(() => formatNumber(end, decimals, compact));
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || !ref.current || end === 0) return;

    let frameId: number;
    let startTimestamp: number | null = null;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      // Easing out quint
      const easeOut = 1 - Math.pow(1 - progress, 5);
      const current = end * easeOut;
      setDisplayValue(formatNumber(current, decimals, compact));

      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      } else {
        setDisplayValue(formatNumber(end, decimals, compact));
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          // Brief reset to 0 then animate up — only fires ONCE on first scroll
          setDisplayValue(formatNumber(0, decimals, compact));
          frameId = window.requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(ref.current);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [end, duration, decimals, compact]);

  return (
    <span ref={ref} className={className} suppressHydrationWarning>
      {prefix}{displayValue}{suffix}
    </span>
  );
}
