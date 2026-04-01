"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";

export function ProfitCalculator({
  tokenName,
  symbol,
  currentPrice,
  atl
}: {
  tokenName: string;
  symbol: string;
  currentPrice: number;
  atl: number;
}) {
  const [investment, setInvestment] = useState<number>(1000);
  const [purchasePrice, setPurchasePrice] = useState<number>(atl > 0 ? atl : (currentPrice || 1));

  const tokensAcquired = investment / purchasePrice;
  const currentValue = tokensAcquired * currentPrice;
  const roi = ((currentValue - investment) / investment) * 100;
  const isProfit = roi >= 0;

  return (
    <div className="card shadow-glow relative overflow-hidden group">
      <div className="flex items-center gap-3 mb-6">
         <Calculator className="w-5 h-5 text-accent-primary" style={{ color: "var(--accent-primary)" }} />
         <h3 className="text-xl font-bold gradient-text">ROI Calculator</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">Initial Investment ($USD)</label>
          <div className="relative">
             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
             <input 
               type="number"
               min="1"
               value={investment}
               onChange={(e) => setInvestment(Number(e.target.value))}
               className="w-full bg-elevated border border-border-color rounded-md py-2.5 pl-8 pr-4 text-primary focus:outline-none focus:border-accent-primary transition-all"
               style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border-color)", border: "1px solid var(--border-color)" }}
             />
          </div>
        </div>
        
        <div>
           <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">If you bought at ($USD)</label>
           <div className="relative">
             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
             <input 
               type="number"
               step="any"
               min="0"
               value={purchasePrice}
               onChange={(e) => setPurchasePrice(Number(e.target.value))}
               className="w-full bg-elevated border border-border-color rounded-md py-2.5 pl-8 pr-4 text-primary focus:outline-none focus:border-accent-primary transition-all"
               style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border-color)", border: "1px solid var(--border-color)" }}
             />
           </div>
           {atl > 0 && (
             <button 
               onClick={() => setPurchasePrice(atl)} 
               className="text-xs text-accent-secondary mt-2 hover:underline transition-colors block"
               style={{ color: "var(--accent-secondary)" }}
             >
               Set to All-Time Low
             </button>
           )}
        </div>
      </div>
      
      <div className="bg-bg-secondary border border-border-color rounded-lg p-6 text-center" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
         <div className="text-xs uppercase tracking-widest text-muted mb-2 font-bold">Your {symbol.toUpperCase()} worth</div>
         <div className={`text-4xl font-extrabold tracking-tight mb-2 ${isProfit ? 'price-up' : 'price-down'}`}>
           ${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
         </div>
         <div className="flex items-center justify-center gap-2">
           <span className={`badge ${isProfit ? 'badge-green' : 'badge-red'} px-4 py-1.5`}>
              {roi >= 0 ? '▲' : '▼'} {roi.toFixed(2)}% ROI
           </span>
         </div>
      </div>
    </div>
  );
}
