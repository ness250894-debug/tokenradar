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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
       <div className="flex items-center gap-3 mb-6">
         <Users className="w-5 h-5 text-indigo-400" />
         <h3 className="text-xl font-bold text-white">Community Sentiment</h3>
       </div>
       
       <p className="text-sm text-gray-400 mb-6">How do you feel about this token today?</p>
       
       {!vote ? (
         <div className="grid grid-cols-2 gap-4">
           <button 
             onClick={() => handleVote('bullish')} 
             className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-emerald-500/30 text-emerald-400 py-3 rounded-lg transition-colors font-medium"
           >
             <TrendingUp className="w-4 h-4" /> Bullish
           </button>
           <button 
             onClick={() => handleVote('bearish')}
             className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-rose-500/30 text-rose-400 py-3 rounded-lg transition-colors font-medium"
           >
             <TrendingDown className="w-4 h-4" /> Bearish
           </button>
         </div>
       ) : (
         <div className="space-y-4">
           <div>
             <div className="flex justify-between text-sm mb-1 font-medium">
               <span className="text-emerald-400 flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Bullish</span>
               <span className="text-emerald-400">{bullPct}%</span>
             </div>
             <div className="w-full bg-gray-800 rounded-full h-2">
               <div className="bg-emerald-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${bullPct}%` }}></div>
             </div>
           </div>
           
           <div>
             <div className="flex justify-between text-sm mb-1 font-medium">
               <span className="text-rose-400 flex items-center gap-1"><TrendingDown className="w-4 h-4" /> Bearish</span>
               <span className="text-rose-400">{bearPct}%</span>
             </div>
             <div className="w-full bg-gray-800 rounded-full h-2">
               <div className="bg-rose-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${bearPct}%` }}></div>
             </div>
           </div>
           
           <p className="text-xs text-gray-500 text-center mt-4">Thanks for voting! Your vote has been recorded.</p>
         </div>
       )}
    </div>
  );
}
