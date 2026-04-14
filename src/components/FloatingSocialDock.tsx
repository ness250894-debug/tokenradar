"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface SocialItem {
  name: string;
  url: string;
  icon: string;
}

const SOCIALS: SocialItem[] = [
  { name: "X (Twitter)", url: "https://x.com/tokenradarco", icon: "𝕏" },
  { name: "Telegram", url: "https://t.me/TokenRadarCo", icon: "✈️" },
];

export function FloatingSocialDock() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (isMobile) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "var(--space-2xl)", /* Increased bottom gap */
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-sm)",
        padding: "var(--space-xs) var(--space-sm)",
        background: "rgba(10, 10, 10, 0.6)",
        backdropFilter: "blur(12px)",
        border: "1px solid var(--border-color)",
        borderRadius: "999px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
      }}
    >
      {SOCIALS.map((social, index) => {
        const isHovered = hoveredIndex === index;
        const isNeighbor = hoveredIndex !== null && Math.abs(hoveredIndex - index) === 1;

        let scale = 1;
        let translateY = 0;
        if (isHovered) {
          scale = 1.4;
          translateY = -8;
        } else if (isNeighbor) {
          scale = 1.15;
          translateY = -4;
        }

        return (
          <Link
            key={social.name}
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            title={social.name}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: isHovered ? "var(--accent-primary)" : "var(--bg-elevated)",
              color: isHovered ? "#fff" : "var(--text-primary)",
              transform: `scale(${scale}) translateY(${translateY}px)`,
              transition: "all 0.2s cubic-bezier(0.25, 1, 0.5, 1)",
              textDecoration: "none",
              fontSize: "1.2rem",
              zIndex: isHovered ? 10 : 1,
            }}
          >
            {social.icon}
          </Link>
        );
      })}
    </div>
  );
}
