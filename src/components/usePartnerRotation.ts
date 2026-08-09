"use client";

import { useEffect, useState } from "react";

export const PARTNER_ROTATION_DELAY_MS = 8_000;

export function getWrappedPartnerIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) return 0;
  return ((index % itemCount) + itemCount) % itemCount;
}

export function usePartnerRotation(itemCount: number, initialIndex = 0) {
  const [activeIndex, setActiveIndex] = useState(() =>
    getWrappedPartnerIndex(initialIndex, itemCount),
  );
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pauseForReducedMotion = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) setIsPlaying(false);
    };

    pauseForReducedMotion(reducedMotion);
    reducedMotion.addEventListener("change", pauseForReducedMotion);
    return () => reducedMotion.removeEventListener("change", pauseForReducedMotion);
  }, []);

  useEffect(() => {
    if (!isPlaying || itemCount <= 1) return;

    const timeoutId = window.setTimeout(() => {
      setActiveIndex((current) => getWrappedPartnerIndex(current + 1, itemCount));
    }, PARTNER_ROTATION_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeIndex, isPlaying, itemCount]);

  const goTo = (index: number) => {
    setActiveIndex(getWrappedPartnerIndex(index, itemCount));
  };

  const goNext = () => {
    setActiveIndex((current) => getWrappedPartnerIndex(current + 1, itemCount));
  };

  const goPrevious = () => {
    setActiveIndex((current) => getWrappedPartnerIndex(current - 1, itemCount));
  };

  return {
    activeIndex,
    goNext,
    goPrevious,
    goTo,
    isPlaying,
  };
}
