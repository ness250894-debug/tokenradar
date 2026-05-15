"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Users } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

interface SentimentPollProps {
  tokenId: string;
  title?: string;
  prompt?: string;
  positiveLabel?: string;
  negativeLabel?: string;
  recordedLabel?: string;
  variant?: "default" | "compact";
  className?: string;
}

export function SentimentPoll({
  tokenId,
  title = "Sentiment Poll",
  prompt = "How do you feel about this token today?",
  positiveLabel = "Bullish Sentiment",
  negativeLabel = "Bearish Sentiment",
  recordedLabel = "Thanks for voting! Market sentiment recorded.",
  variant = "default",
  className = "",
}: SentimentPollProps) {
  const isCompact = variant === "compact";
  const [vote, setVote] = useState<'bullish' | 'bearish' | null>(null);
  const [bullVotes, setBullVotes] = useState<number>(76); // mock baseline
  const [bearVotes, setBearVotes] = useState<number>(24); // mock baseline
  
  useEffect(() => {
     let hash = 0;
     for (let i = 0; i < tokenId.length; i++) {
        hash = tokenId.charCodeAt(i) + ((hash << 5) - hash);
     }
     const bullBaseline = 50 + (Math.abs(hash) % 40);
     // eslint-disable-next-line react-hooks/set-state-in-effect
     setBullVotes(bullBaseline);
     setBearVotes(100 - bullBaseline);
     
     const saved = localStorage.getItem(`sentiment_${tokenId}`);
     if (saved === 'bullish' || saved === 'bearish') {
       setVote(saved);
       if (saved === 'bullish') setBullVotes(v => v + 1);
       if (saved === 'bearish') setBearVotes(v => v + 1);
     }
  }, [tokenId]);

  const total = bullVotes + bearVotes;
  const bullPct = Math.round((bullVotes / total) * 100);
  const bearPct = 100 - bullPct;

  const handleVote = (choice: 'bullish' | 'bearish') => {
    if (vote) return; // already voted
    setVote(choice);
    localStorage.setItem(`sentiment_${tokenId}`, choice);
    if (choice === 'bullish') setBullVotes(v => v + 1);
    if (choice === 'bearish') setBearVotes(v => v + 1);
    trackEvent("sentiment_vote", {
      token_id: tokenId,
      vote_choice: choice,
      page_path: window.location.pathname,
    });
  };

  return (
    <div className={`card sentiment-poll sentiment-poll-${variant} ${className}`} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isCompact ? "var(--space-md)" : "var(--space-lg)" }}>
         <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
           <Users size={18} style={{ color: "var(--accent-secondary)" }} />
           <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0 }}>{title}</h3>
         </div>
      </div>
       
       <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: isCompact ? "var(--space-md)" : "var(--space-xl)" }}>
         {prompt}
       </p>
       
       {!vote ? (
         <div style={{ display: "grid", gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "1fr", gap: "var(--space-sm)", marginTop: "auto" }}>
            <button 
              onClick={() => handleVote('bullish')} 
              className="btn btn-secondary" 
              style={{ padding: "var(--space-sm)", border: "1px solid var(--green)", borderRadius: "var(--radius-lg)", color: "var(--green)", minWidth: 0 }}
            >
              <TrendingUp size={isCompact ? 16 : 20} />
              <span>{positiveLabel}</span>
            </button>
            <button 
              onClick={() => handleVote('bearish')}
              className="btn btn-secondary"
              style={{ padding: "var(--space-sm)", border: "1px solid var(--red)", borderRadius: "var(--radius-lg)", color: "var(--red)", minWidth: 0 }}
            >
              <TrendingDown size={isCompact ? 16 : 20} />
              <span>{negativeLabel}</span>
            </button>
         </div>
       ) : (
         <div style={{ marginTop: "auto" }}>
            <div style={{ marginBottom: "var(--space-lg)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-xs)" }}>
                <span className="price-up" style={{ fontSize: "var(--text-xs)", display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
                  <TrendingUp size={14} /> Bullish
                </span>
                <span className="price-up" style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{bullPct}%</span>
              </div>
              <div style={{ width: "100%", background: "var(--bg-secondary)", borderRadius: "var(--radius-full)", height: "8px", overflow: "hidden" }}>
                <div style={{ width: `${bullPct}%`, background: "var(--green)", height: "100%", transition: "all 1s" }}></div>
              </div>
            </div>
            
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-xs)" }}>
                <span className="price-down" style={{ fontSize: "var(--text-xs)", display: "flex", alignItems: "center", gap: "var(--space-xs)" }}>
                  <TrendingDown size={14} /> Bearish
                </span>
                <span className="price-down" style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{bearPct}%</span>
              </div>
              <div style={{ width: "100%", background: "var(--bg-secondary)", borderRadius: "var(--radius-full)", height: "8px", overflow: "hidden" }}>
                <div style={{ width: `${bearPct}%`, background: "var(--red)", height: "100%", transition: "all 1s" }}></div>
              </div>
            </div>
            
            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "var(--space-lg)", textAlign: "center", fontStyle: "italic" }}>
              {recordedLabel}
            </p>
         </div>
       )}
    </div>
  );
}
