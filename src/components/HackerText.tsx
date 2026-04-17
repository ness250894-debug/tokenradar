"use client";

import { useState, useRef, useEffect } from "react";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface HackerTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

export function HackerText({ text, className, style }: HackerTextProps) {
  const [mounted, setMounted] = useState(false);
  const [displayText, setDisplayText] = useState(text);
  const isHovered = useRef(false);
  const intervalRef = useRef<number | null>(null);

  const startAnimation = () => {
    isHovered.current = true;
    let iteration = 0;
    
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = window.setInterval(() => {
      setDisplayText(() => {
        return text
          .split("")
          .map((_, index) => {
            if (index < iteration) {
              return text[index];
            }
            return LETTERS[Math.floor(Math.random() * 26)];
          })
          .join("");
      });

      // Adjust speed of resolution here (lower = slower to resolve)
      iteration += 1 / 2;

      if (iteration >= text.length) {
        clearInterval(intervalRef.current!);
        setDisplayText(text);
      }
    }, 30);
  };

  const handleMouseLeave = () => {
    isHovered.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setDisplayText(text);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!mounted) {
    return (
      <span className={className} style={{ ...style, display: "inline-block" }}>
        {text}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ ...style, display: "inline-block", cursor: "default" }}
      onMouseEnter={startAnimation}
      onMouseLeave={handleMouseLeave}
    >
      {displayText}
    </span>
  );
}
