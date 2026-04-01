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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl relative overflow-hidden group">
      <div className="flex items-center gap-3 mb-6">
         <Calculator className="w-5 h-5 text-blue-400" />
         <h3 className="text-xl font-bold text-white">ROI Calculator</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">Initial Investment ($USD)</label>
          <div className="relative">
             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
             <input 
               type="number"
               min="1"
               value={investment}
               onChange={(e) => setInvestment(Number(e.target.value))}
               className="w-full bg-gray-950 border border-gray-700 rounded-lg py-2 pl-8 pr-4 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
             />
          </div>
        </div>
        
        <div>
           <label className="block text-sm font-medium text-gray-400 mb-2">If you bought at ($USD)</label>
           <div className="relative">
             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
             <input 
               type="number"
               step="any"
               min="0"
               value={purchasePrice}
               onChange={(e) => setPurchasePrice(Number(e.target.value))}
               className="w-full bg-gray-950 border border-gray-700 rounded-lg py-2 pl-8 pr-4 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
             />
           </div>
           {atl > 0 && <button onClick={() => setPurchasePrice(atl)} className="text-xs text-blue-400 mt-2 hover:underline">Set to All-Time Low</button>}
        </div>
      </div>
      
      <div className="bg-gray-950 border border-gray-800 rounded-lg p-5 text-center">
         <div className="text-sm text-gray-400 mb-1">Your {symbol.toUpperCase()} would be worth</div>
         <div className={`text-3xl font-bold tracking-tight mb-2 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
           ${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
         </div>
         <div className="text-sm">
           <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
              {roi >= 0 ? '+' : ''}{roi.toFixed(2)}% ROI
           </span>
         </div>
      </div>
    </div>
  );
}
