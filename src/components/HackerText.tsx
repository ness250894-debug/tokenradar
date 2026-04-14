"use client";

import { useState, useRef } from "react";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface HackerTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

export function HackerText({ text, className, style }: HackerTextProps) {
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
          .map((letter, index) => {
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
    if (intervalRef.current) clearInterval(intervalRef.current);
    setDisplayText(text);
  };

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
