"use client";

import { useEffect, useState, useRef } from "react";

interface RiskMeterGaugeProps {
  score: number; // 0-10
  size?: number;
}

export function RiskMeterGauge({ score, size = 120 }: RiskMeterGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const meterRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        // Simple animation
        let start = 0;
        const duration = 1500;
        const startTime = performance.now();
        
        const animate = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // easeOutQuart
          const ease = 1 - Math.pow(1 - progress, 4);
          
          setAnimatedScore(score * ease);
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        };
        requestAnimationFrame(animate);
        observer.disconnect();
      }
    }, { threshold: 0.1 });
    
    if (meterRef.current) observer.observe(meterRef.current);
    return () => observer.disconnect();
  }, [score]);

  // Map 0-10 score to angle (0 to 180 degrees)
  const angle = (animatedScore / 10) * 180;
  
  // Calculate color: green (low) -> yellow (med) -> red (high)
  const getScoreColor = (val: number) => {
    if (val <= 3) return "var(--green)";
    if (val <= 7) return "var(--yellow)";
    return "var(--red)";
  };

  const needleColor = getScoreColor(animatedScore);
  const displayScore = animatedScore.toFixed(1);

  return (
    <div 
      ref={meterRef} 
      style={{ 
        width: size, 
        height: size / 2 + 20, 
        position: "relative", 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center" 
      }}
    >
      <div style={{ position: "relative", width: size, height: size / 2, overflow: "hidden" }}>
        {/* Background track */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: "50%",
          boxSizing: "border-box",
          border: `${size * 0.15}px solid var(--border-color)`,
          borderBottomColor: "transparent",
          borderRightColor: "transparent",
          transform: "rotate(45deg)",
        }} />
        
        {/* Needle container */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          width: size,
          height: "2px",
          transformOrigin: "center",
          transform: `translateX(-50%) rotate(${angle}deg)`,
          transition: "transform 0.1s linear"
        }}>
          {/* Needle itself */}
          <div style={{
            position: "absolute",
            right: "50%",
            top: -2,
            width: "40%",
            height: "4px",
            backgroundColor: needleColor,
            borderRadius: "4px",
            boxShadow: `0 0 8px ${needleColor}`
          }} />
        </div>
      </div>
      
      {/* Label */}
      <div style={{ 
        marginTop: "var(--space-xs)", 
        fontWeight: 800, 
        fontSize: "var(--text-xl)",
        color: needleColor,
        textShadow: `0 0 10px ${needleColor}40`
      }}>
        {displayScore} 
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginLeft: "4px", verticalAlign: "middle", textShadow: "none" }}>
          / 10
        </span>
      </div>
    </div>
  );
}
