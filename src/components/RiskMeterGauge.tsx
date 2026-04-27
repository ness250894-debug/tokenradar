"use client";

import { useEffect, useState, useRef } from "react";
import { getRiskTier } from "@/lib/formatters";

interface RiskMeterGaugeProps {
  score: number; // 0-10
  size?: number;
}

export function RiskMeterGauge({ score, size = 120 }: RiskMeterGaugeProps) {
  // Initialize to target score to match SSR output and prevent displaying "0.0" on hydration
  const [animatedScore, setAnimatedScore] = useState(score);
  const meterRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!meterRef.current) return;

    let frameId: number;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        // Reset to 0 then animate up - only on first intersection
        setAnimatedScore(0);
        
        const duration = 1500;
        const startTime = performance.now();
        
        const animate = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // easeOutQuart
          const ease = 1 - Math.pow(1 - progress, 4);
          
          setAnimatedScore(score * ease);
          
          if (progress < 1) {
            frameId = requestAnimationFrame(animate);
          } else {
            setAnimatedScore(score);
          }
        };
        requestAnimationFrame(animate);
        observer.disconnect();
      }
    }, { threshold: 0.1 });
    
    observer.observe(meterRef.current);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [score]);

  // Map 1-10 score to angle (-90 to +90 degrees)
  // -90 is pointing Left, 0 is pointing Up, +90 is pointing Right
  const angle = ((animatedScore - 1) / 9) * 180 - 90;

  // Calculate tier: low (< 4), medium (< 7), high (7-10) using shared formatter
  const tier = getRiskTier(score); // Use target score for tier colors to be stable
  const tierColor = tier === "LOW" ? "var(--green)" : tier === "MEDIUM" ? "var(--yellow)" : "var(--red)";

  const displayScore = animatedScore.toFixed(1);

  return (
    <div 
      ref={meterRef} 
      style={{ 
        width: size, 
        height: size / 2 + 45, 
        position: "relative", 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center",
        justifyContent: "flex-end"
      }}
    >
      <div style={{ position: "relative", width: size, height: size / 2, overflow: "visible" }}>
        {/* Sector Labels */}
        <div style={{ position: "absolute", bottom: "10%", left: "5%", fontSize: "9px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Low</div>
        <div style={{ position: "absolute", top: "-10%", left: "50%", transform: "translateX(-50%)", fontSize: "9px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>Mid</div>
        <div style={{ position: "absolute", bottom: "10%", right: "5%", fontSize: "9px", color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>High</div>

        {/* Background track (Arc) - Full width */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: "50%",
          boxSizing: "border-box",
          border: `${size * 0.1}px solid var(--border-color)`,
          borderBottomColor: "transparent",
          borderRightColor: "transparent",
          transform: "rotate(45deg)",
          opacity: 0.2
        }} />

        {/* Dynamic Tier Highlight (Arc) */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: "50%",
          boxSizing: "border-box",
          border: `${size * 0.1}px solid ${tierColor}`,
          borderBottomColor: "transparent",
          borderRightColor: "transparent",
          transform: "rotate(45deg)",
          opacity: 0.15,
          filter: "blur(2px)",
          transition: "border-color 0.5s ease"
        }} />
        
        {/* Needle container */}
        <div style={{
          position: "absolute",
          bottom: "0",
          left: "50%",
          width: "4px", // Thicker needle
          height: "85%",
          backgroundColor: tierColor,
          transformOrigin: "bottom center",
          transform: `translateX(-50%) rotate(${angle}deg)`,
          borderRadius: "4px",
          boxShadow: `0 0 15px ${tierColor}`,
          transition: "transform 0.1s linear, background-color 0.3s ease",
          zIndex: 10
        }}>
           {/* Needle Cap - Outer */}
           <div style={{
             position: "absolute",
             bottom: -6,
             left: "50%",
             transform: "translateX(-50%)",
             width: 12,
             height: 12,
             borderRadius: "50%",
             backgroundColor: "var(--bg-primary)",
             border: `2px solid ${tierColor}`,
           }} />
           {/* Needle Cap - Inner */}
           <div style={{
             position: "absolute",
             bottom: -2,
             left: "50%",
             transform: "translateX(-50%)",
             width: 4,
             height: 4,
             borderRadius: "50%",
             backgroundColor: tierColor,
           }} />
        </div>
      </div>
      
      {/* Label */}
      <div suppressHydrationWarning style={{ 
        marginTop: "var(--space-md)", 
        fontWeight: 900, 
        fontSize: "var(--text-2xl)",
        color: tierColor,
        textShadow: `0 0 15px ${tierColor}30`,
        letterSpacing: "-1px",
        display: "flex",
        alignItems: "baseline",
        gap: "4px"
      }}>
        {displayScore} 
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", verticalAlign: "middle", textShadow: "none", fontWeight: 600, opacity: 0.7 }}>
          SCORE
        </span>
      </div>
    </div>
  );
}
