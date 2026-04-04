"use client";

import { useEffect, useState } from "react";

export function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateScroll = () => {
      // Calculate how far the user has scrolled
      const currentScrollY = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      
      if (scrollHeight > 0) {
        setProgress((currentScrollY / scrollHeight) * 100);
      }
    };

    window.addEventListener("scroll", updateScroll, { passive: true });
    // Initial check
    updateScroll();

    return () => window.removeEventListener("scroll", updateScroll);
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: "var(--nav-height)",
        left: 0,
        height: "3px",
        background: "var(--accent-gradient)",
        width: `${progress}%`,
        zIndex: 99,
        transition: "width 0.1s ease-out",
        boxShadow: "var(--shadow-glow)",
      }}
    />
  );
}
