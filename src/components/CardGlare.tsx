"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";

interface CardGlareProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  color?: string;
}

export function CardGlare({ children, className = "", style = {}, color }: CardGlareProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    
    // Calculate mouse position relative to the element (0 to 1)
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Calculate rotation limits (-10 to 10 degrees)
    const rotateY = (x - 0.5) * 20; // rotation around Y axis driven by mouse X 
    const rotateX = (0.5 - y) * 20; // rotation around X axis driven by mouse Y

    setRotate({ x: rotateX, y: rotateY });
    setGlare({ x: x * 100, y: y * 100, opacity: 1 });
  };

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
    setGlare({ opacity: 0, x: 50, y: 50 });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{
        ...style,
        position: "relative",
        transformStyle: "preserve-3d",
        transform: `perspective(1000px) rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
        transition: glare.opacity === 0 ? "transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)" : "none",
        willChange: "transform",
      }}
    >
      {children}

      {/* Glare effect overlay */}
      <div
        className="pointer-events-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          borderRadius: "inherit",
          background: `radial-gradient(
            circle at ${glare.x}% ${glare.y}%, 
            ${color ? `${color}` : 'rgba(255,255,255,0.15)'} 0%, 
            rgba(255,255,255,0) 60%
          )`,
          opacity: glare.opacity,
          transition: glare.opacity === 0 ? "opacity 0.5s" : "none",
          zIndex: 10,
          pointerEvents: "none"
        }}
      />
    </div>
  );
}
