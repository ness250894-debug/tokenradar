"use client";

import { useState } from "react";

export function ContentGate({ children, htmlContent }: { children?: React.ReactNode, htmlContent?: string }) {
  const [isUnlocked, setIsUnlocked] = useState(false);

  const handleUnlock = () => {
    // Reveal the content when the user "converts". 
    // In a real app this might verify an auth token, but for CRO we reward the intent to join.
    setIsUnlocked(true);
  };

  return (
    <div style={{ position: "relative" }}>
      <div 
        style={{ 
          maxHeight: isUnlocked ? "none" : "600px", 
          overflow: "hidden", 
          maskImage: isUnlocked ? "none" : "linear-gradient(to bottom, black 50%, transparent 100%)", 
          WebkitMaskImage: isUnlocked ? "none" : "linear-gradient(to bottom, black 50%, transparent 100%)",
          transition: "max-height 0.8s ease-in-out"
        }}
        dangerouslySetInnerHTML={htmlContent ? { __html: htmlContent } : undefined}
      >
        {children}
      </div>
      
      {!isUnlocked && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "var(--space-2xl)", display: "flex", justifyContent: "center", alignItems: "flex-end", height: "300px", background: "linear-gradient(to top, var(--bg-default) 20%, transparent)" }}>
          <a 
            href="https://t.me/TokenRadarCo" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn btn-primary" 
            style={{ boxShadow: "0 4px 32px rgba(0, 200, 83, 0.4)", fontWeight: 700 }}
            onClick={handleUnlock}
          >
            <span style={{ marginRight: "0.5rem" }}>🔓</span> Join Telegram For Full Alpha
          </a>
        </div>
      )}
    </div>
  );
}
