"use client";

import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TokenCard, type TokenCardData } from "./TokenCard";
import { ChevronRight, ChevronLeft } from "lucide-react";

interface DiscoverySliderProps {
  tokens: TokenCardData[];
  title?: string;
}

export function DiscoverySlider({ tokens, title }: DiscoverySliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (containerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
      setCanScrollLeft(scrollLeft > 20);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 20);
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll);
      checkScroll();
      return () => el.removeEventListener("scroll", checkScroll);
    }
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (containerRef.current) {
      const scrollAmount = containerRef.current.clientWidth * 0.8;
      containerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth"
      });
    }
  };

  return (
    <div className="discovery-slider-wrapper relative group">
      {title && (
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold tracking-tight">
            {title}
          </h2>
          <div className="flex gap-2">
            <button 
              onClick={() => scroll("left")}
              disabled={!canScrollLeft}
              className={`p-2 rounded-full border transition-all ${
                canScrollLeft 
                  ? "border-accent text-accent hover:bg-accent/10 opacity-100" 
                  : "border-color text-muted opacity-30 cursor-not-allowed"
              }`}
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => scroll("right")}
              disabled={!canScrollRight}
              className={`p-2 rounded-full border transition-all ${
                canScrollRight 
                  ? "border-accent text-accent hover:bg-accent/10 opacity-100" 
                  : "border-color text-muted opacity-30 cursor-not-allowed"
              }`}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Main Slider Container */}
      <div className="relative">
        {/* Fading Edge Indicators */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none transition-opacity duration-300"
          style={{ 
            background: "linear-gradient(to right, var(--bg-primary) 0%, transparent 100%)",
            opacity: canScrollLeft ? 1 : 0 
          }}
        />
        <div 
          className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none transition-opacity duration-300"
          style={{ 
            background: "linear-gradient(to left, var(--bg-primary) 0%, transparent 100%)",
            opacity: canScrollRight ? 1 : 0 
          }}
        />

        <div 
          ref={containerRef}
          className="flex gap-6 overflow-x-auto overflow-y-hidden no-scrollbar pb-8 scroll-smooth"
          style={{ 
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch"
          }}
        >
          {tokens.map((token, idx) => (
            <motion.div 
              key={token.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="min-w-[320px] max-w-[320px] md:min-w-[340px] md:max-w-[340px] h-full"
            >
              <TokenCard token={token} />
            </motion.div>
          ))}
          {/* Spacer for right padding */}
          <div className="min-w-[20px] shrink-0" />
        </div>
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
