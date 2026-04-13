"use client";

import { useState } from "react";
import { getTokenIconUrl } from "@/lib/formatters";

interface TokenIconProps {
  symbol: string;
  name: string;
  id?: string;
  imageUrl?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Smart Token Icon component that falls back to a Letter Avatar if the image hits a 404.
 * Guarantees a clean, premium look regardless of asset availability.
 */
export function TokenIcon({ 
  symbol, 
  name, 
  id, 
  imageUrl,
  size = 24, 
  className = "", 
  style = {} 
}: TokenIconProps) {
  const [error, setError] = useState(false);
  const iconUrl = imageUrl || getTokenIconUrl(symbol, id);
  const [isAvatar, setIsAvatar] = useState(!iconUrl);

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: size >= 40 ? "var(--radius-md)" : "var(--radius-sm)",
    fontSize: `${size}px`, // Used for relative sizing of letter in CSS
    ...style
  };

  // If we have an error or no URL, show the letter avatar
  if (error || isAvatar || !iconUrl) {
    return (
      <div 
        className={`token-icon-container ${className}`} 
        style={containerStyle}
        title={`${name} (${symbol.toUpperCase()})`}
      >
        <div className="letter-avatar">
          {symbol.charAt(0).toUpperCase()}
        </div>
      </div>
    );
  }

  return (
    <div className={`token-icon-container ${className}`} style={containerStyle}>
      <img
        src={iconUrl}
        alt={`${name} icon`}
        className="img-icon"
        onError={() => setError(true)}
        loading="lazy"
      />
    </div>
  );
}
