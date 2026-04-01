"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Users } from "lucide-react";

export function SentimentPoll({ tokenId }: { tokenId: string }) {
  const [vote, setVote] = useState<'bullish' | 'bearish' | null>(null);
  const [bullVotes, setBullVotes] = useState<number>(76); // mock baseline
  const [bearVotes, setBearVotes] = useState<number>(24); // mock baseline
  
  // Use a stable pseudo-random basline derived from tokenId so it persists smoothly during SSG
  useEffect(() => {
     let hash = 0;
     for (let i = 0; i < tokenId.length; i++) {
        hash = tokenId.charCodeAt(i) + ((hash << 5) - hash);
     }
     const bullBaseline = 50 + (Math.abs(hash) % 40);
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
  };

  return (
    <div className="card shadow-glow">
       <div className="flex items-center gap-3 mb-6">
         <Users className="w-5 h-5 text-accent-secondary" style={{ color: "var(--accent-secondary)" }} />
         <h3 className="text-xl font-bold gradient-text">Community Sentiment</h3>
       </div>
       
       <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-6 px-1">How do you feel about this token today?</p>
       
       {!vote ? (
         <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => handleVote('bullish')} 
              className="btn btn-secondary flex-1 border-emerald-500/20 hover:border-emerald-500/50 hover:bg-emerald-500/5 group/btn transition-all py-4"
            >
              <TrendingUp className="w-4 h-4 text-emerald-400 group-hover/btn:scale-110 transition-transform" /> 
              <span className="text-emerald-400 font-bold">Bullish</span>
            </button>
            <button 
              onClick={() => handleVote('bearish')}
              className="btn btn-secondary flex-1 border-rose-500/20 hover:border-rose-500/50 hover:bg-rose-500/5 group/btn transition-all py-4"
            >
              <TrendingDown className="w-4 h-4 text-rose-400 group-hover/btn:scale-110 transition-transform" /> 
              <span className="text-rose-400 font-bold">Bearish</span>
            </button>
         </div>
       ) : (
         <div className="space-y-4 text-left">
            <div>
              <div className="flex justify-between text-xs mb-2 font-bold uppercase tracking-widest">
                <span className="text-emerald-400 flex items-center gap-1.5"><TrendingUp className="w-3 h-3" /> Bullish</span>
                <span className="text-emerald-400">{bullPct}%</span>
              </div>
              <div className="w-full bg-bg-secondary rounded-full h-2.5 overflow-hidden p-0.5" style={{ backgroundColor: "var(--bg-secondary)" }}>
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(16,185,129,0.3)]" 
                  style={{ width: `${bullPct}%`, background: "var(--green)" }}
                ></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-xs mb-2 font-bold uppercase tracking-widest">
                <span className="text-rose-400 flex items-center gap-1.5"><TrendingDown className="w-3 h-3" /> Bearish</span>
                <span className="text-rose-400">{bearPct}%</span>
              </div>
              <div className="w-full bg-bg-secondary rounded-full h-2.5 overflow-hidden p-0.5" style={{ backgroundColor: "var(--bg-secondary)" }}>
                <div 
                  className="bg-rose-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(244,63,94,0.3)]" 
                  style={{ width: `${bearPct}%`, background: "var(--red)" }}
                ></div>
              </div>
            </div>
            
            <p className="text-xs text-muted text-center mt-4 italic font-medium">Thanks for voting! Your sentiment has been recorded.</p>
         </div>
       )}
    </div>
  );
}
