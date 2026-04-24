"use client";

import { useEffect, useState } from "react";

import { Bell } from "lucide-react";
import { MagneticEffect } from "./MagneticEffect";

interface StickyConversionHeaderProps {
  title: string;
  symbol: string;
  price?: string;
  actionText?: string;
  actionUrl?: string;
  threshold?: number;
}

export function StickyConversionHeader({
  title,
  symbol,
  price,
  actionText = "Join Telegram",
  actionUrl = "https://t.me/TokenRadarCo",
  threshold = 400
}: StickyConversionHeaderProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > threshold) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Check initial scroll position

    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: "rgba(10, 10, 10, 0.8)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border-color)",
        transform: isVisible ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
        zIndex: 99,
        padding: "var(--space-sm) 0",
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.4)"
      }}
    >
      <div className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-md)", padding: "0 var(--space-md)", overflowX: "clip" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", minWidth: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-xs)", minWidth: 0 }}>
            <span style={{ fontWeight: 800, fontSize: "var(--text-base)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
            <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-xs)", flexShrink: 0 }}>{symbol}</span>
          </div>
          {price && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
              <div 
                style={{ 
                  width: "6px", 
                  height: "6px", 
                  backgroundColor: "var(--green)", 
                  borderRadius: "50%",
                  animation: "pulse 2s infinite" 
                }} 
              />
              <span style={{ fontWeight: 700, color: "var(--green)", fontFamily: "monospace", fontSize: "var(--text-sm)" }}>${price}</span>
            </div>
          )}
        </div>
        
        <MagneticEffect>
          <a 
            href={actionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ padding: "0.4rem 1rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}
          >
            <Bell size={14} style={{ marginRight: "0.4rem" }} />
            {actionText}
          </a>
        </MagneticEffect>
      </div>
    </div>
  );
}
