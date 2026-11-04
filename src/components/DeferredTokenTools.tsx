"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { PricePoint } from "@/lib/content-loader";

const Chart = dynamic(() => import("./PriceChart").then((module) => module.PriceChart), { ssr: false });
const Calculator = dynamic(() => import("./ProfitCalculator").then((module) => module.ProfitCalculator), { ssr: false });
const Poll = dynamic(() => import("./SentimentPoll").then((module) => module.SentimentPoll), { ssr: false });

/** Keep space in the initial HTML; fetch tool code only as the reader approaches it. */
function NearViewport({ children, fallback, minHeight, className }: { children: ReactNode; fallback: ReactNode; minHeight?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "200px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={className} style={{ minHeight }}>{visible ? children : fallback}</div>;
}

export function DeferredPriceChart({ data, isPositive }: { data: PricePoint[]; isPositive: boolean }) {
  return (
    <NearViewport minHeight={310} fallback={<p>Scroll to explore the cached price history.</p>}>
      <Chart data={data} height={280} isPositive={isPositive} label="30-Day Price History" />
    </NearViewport>
  );
}

export function DeferredTokenEngagement({ currentPrice, atl, tokenId }: { currentPrice: number; atl: number; tokenId: string }) {
  return (
    <NearViewport className="token-tools-reserved" fallback={<p>Scroll to use the return calculator and sentiment poll.</p>}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Calculator currentPrice={currentPrice} atl={atl} tokenId={tokenId} />
        <Poll tokenId={tokenId} />
      </div>
    </NearViewport>
  );
}
