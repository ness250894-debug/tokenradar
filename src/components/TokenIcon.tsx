"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { getTokenIconCandidates } from "@/lib/formatters";

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
  const iconCandidates = useMemo(
    () => getTokenIconCandidates({ symbol, id, imageUrl }),
    [symbol, id, imageUrl],
  );
  const candidateKey = iconCandidates.join("\0");
  const [failedCandidate, setFailedCandidate] = useState({ key: "", index: 0 });
  const candidateIndex = failedCandidate.key === candidateKey ? failedCandidate.index : 0;
  const iconUrl = iconCandidates[candidateIndex];
  const isAvatar = !iconUrl;

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: size >= 40 ? "var(--radius-md)" : "var(--radius-sm)",
    fontSize: `${size}px`, // Used for relative sizing of letter in CSS
    ...style
  };

  // If all candidates fail, show the letter avatar.
  if (isAvatar || !iconUrl) {
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
      <Image
        src={iconUrl}
        alt={`${name} (${symbol.toUpperCase()}) icon`}
        width={size}
        height={size}
        className="img-icon"
        onError={() => setFailedCandidate({ key: candidateKey, index: candidateIndex + 1 })}
        unoptimized
      />
    </div>
  );
}
