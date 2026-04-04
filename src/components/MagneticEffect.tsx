"use client";

import { useEffect, useRef, useState, ReactNode } from "react";

interface MagneticEffectProps {
  children: ReactNode;
  strength?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function MagneticEffect({ 
  children, 
  strength = 15,
  className = "",
  style = {}
}: MagneticEffectProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isHovered) return;
      const { clientX, clientY } = e;
      const { left, top, width, height } = node.getBoundingClientRect();
      
      const centerX = left + width / 2;
      const centerY = top + height / 2;
      
      // Calculate pull distance
      const distanceX = clientX - centerX;
      const distanceY = clientY - centerY;
      
      setPosition({
        x: (distanceX / width) * strength,
        y: (distanceY / height) * strength,
      });
    };

    const handleMouseLeave = () => {
      setPosition({ x: 0, y: 0 });
      setIsHovered(false);
    };

    const handleMouseEnter = () => {
      setIsHovered(true);
    };

    node.addEventListener("mousemove", handleMouseMove);
    node.addEventListener("mouseleave", handleMouseLeave);
    node.addEventListener("mouseenter", handleMouseEnter);

    return () => {
      node.removeEventListener("mousemove", handleMouseMove);
      node.removeEventListener("mouseleave", handleMouseLeave);
      node.removeEventListener("mouseenter", handleMouseEnter);
    };
  }, [strength, isHovered]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        transform: `translate(${position.x}px, ${position.y}px)`,
        transition: isHovered ? "transform 0.1s ease-out" : "transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)",
        display: "inline-block" // Essential for maintaining original element flow
      }}
    >
      {children}
    </div>
  );
}
