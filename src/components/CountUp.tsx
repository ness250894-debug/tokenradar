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

export function CountUp({
  end,
  duration = 1.5,
  prefix = "",
  suffix = "",
  decimals = 0,
  compact = false,
  className,
}: CountUpProps) {
  const [value, setValue] = useState(end);
  const [isMounted, setIsMounted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    let startTimestamp: number | null = null;
    let observer: IntersectionObserver;
    let frameId: number;
    let hasRun = false;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      
      // Easing out quint
      const easeOut = 1 - Math.pow(1 - progress, 5);
      
      setValue(end * easeOut);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      } else {
        setValue(end);
      }
    };

    const runAnimation = () => {
      hasRun = true;
      frameId = window.requestAnimationFrame(step);
    };

    if (ref.current) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !hasRun) {
            runAnimation();
          }
        },
        { threshold: 0.1 }
      );
      observer.observe(ref.current);
    }

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (observer) observer.disconnect();
    };
  }, [end, duration]);

  // Format the number appropriately (handle compact formatting manually if needed, or rely on caller for raw numbers).
  // This component usually handles raw numbers, but let's allow caller to pass in raw number and we format it.
  
  // Format based on decimals
  let formattedValue = value.toFixed(decimals);
  
  if (compact) {
    if (value >= 1e12) formattedValue = (value / 1e12).toFixed(2) + "T";
    else if (value >= 1e9) formattedValue = (value / 1e9).toFixed(2) + "B";
    else if (value >= 1e6) formattedValue = (value / 1e6).toFixed(2) + "M";
    else if (value >= 1e3) formattedValue = (value / 1e3).toFixed(2) + "K";
    else formattedValue = value.toFixed(2);
  } else if (decimals === 0 && end >= 1000) {
    formattedValue = Math.floor(value).toLocaleString("en-US");
  }

  return (
    <span ref={ref} className={className}>
      {prefix}{formattedValue}{suffix}
    </span>
  );
}
