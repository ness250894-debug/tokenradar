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
  const isPositive = roi >= 0;

  // Formatting helper
  const formatPrice = (price: number) => {
     if (price >= 1) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
     return `$${price.toFixed(6)}`;
  };

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-lg)" }}>
         <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
           <Calculator size={18} style={{ color: "var(--accent-primary)" }} />
           <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, margin: 0 }}>ROI Calculator</h3>
         </div>
      </div>

      <div style={{ flex: 1 }}>
        {/* Investment Input */}
        <div style={{ marginBottom: "var(--space-xl)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-xs)" }}>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Investment Amount</span>
            <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>${investment.toLocaleString()}</span>
          </div>
          <input 
            type="range"
            min="100"
            max="100000"
            step="100"
            value={investment}
            onChange={(e) => setInvestment(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--accent-primary)", cursor: "pointer" }}
          />
        </div>

        {/* Entry Price Input */}
        <div style={{ marginBottom: "var(--space-xl)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-xs)" }}>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Entry Price</span>
            <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{formatPrice(purchasePrice)}</span>
          </div>
          <input 
            type="range"
            min={atl * 0.1 || 0.000001}
            max={currentPrice * 5}
            step={atl / 100 || 0.00001}
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--accent-primary)", cursor: "pointer" }}
          />
          {atl > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-xs)" }}>
              <button 
                onClick={() => setPurchasePrice(atl)} 
                className="btn btn-secondary" 
                style={{ fontSize: "var(--text-2xs)", padding: "var(--space-2xs) var(--space-xs)", height: "auto" }}
              >
                Snap to ATL
              </button>
              <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>ATL: ${atl.toFixed(6)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Result Card */}
      <div style={{ marginTop: "auto", paddingTop: "var(--space-lg)", borderTop: "1px solid var(--border-color)" }}>
         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
           <div>
             <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-2xs)" }}>Current Valuation</div>
             <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
               ${currentValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
             </div>
           </div>
           <div style={{ textAlign: "right" }}>
              <div className={`badge ${isPositive ? "badge-green" : "badge-red"}`} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2xs)" }}>
                {isPositive ? "▲" : "▼"} {roi.toFixed(2)}% ROI
              </div>
           </div>
         </div>
      </div>
    </div>
  );
}
