"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRightLeft, Trophy } from "lucide-react";

interface TokenSimple {
  id: string;
  name: string;
  symbol: string;
}

interface ComparisonSearchProps {
  allTokens: TokenSimple[];
  initialTokenA?: string;
  initialTokenB?: string;
}

export function ComparisonSearch({ allTokens, initialTokenA, initialTokenB }: ComparisonSearchProps) {
  const router = useRouter();
  const [tokenA, setTokenA] = useState(initialTokenA || "");
  const [tokenB, setTokenB] = useState(initialTokenB || "");
  
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  
  const [showA, setShowA] = useState(false);
  const [showB, setShowB] = useState(false);
  
  const containerRefA = useRef<HTMLDivElement>(null);
  const containerRefB = useRef<HTMLDivElement>(null);

  // Filter tokens based on search
  const filteredA = useMemo(() => {
    if (!searchA) return allTokens.slice(0, 10);
    return allTokens
      .filter(t => 
        t.name.toLowerCase().includes(searchA.toLowerCase()) || 
        t.symbol.toLowerCase().includes(searchA.toLowerCase())
      )
      .slice(0, 8);
  }, [searchA, allTokens]);

  const filteredB = useMemo(() => {
    if (!searchB) return allTokens.slice(0, 10);
    return allTokens
      .filter(t => 
        t.name.toLowerCase().includes(searchB.toLowerCase()) || 
        t.symbol.toLowerCase().includes(searchB.toLowerCase())
      )
      .slice(0, 8);
  }, [searchB, allTokens]);

  const selectedAToken = allTokens.find(t => t.id === tokenA);
  const selectedBToken = allTokens.find(t => t.id === tokenB);

  const handleSwap = () => {
    const temp = tokenA;
    setTokenA(tokenB);
    setTokenB(temp);
  };

  const handleCompare = () => {
    if (tokenA && tokenB && tokenA !== tokenB) {
      router.push(`/compare/${tokenA}-vs-${tokenB}`);
    }
  };

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRefA.current && !containerRefA.current.contains(event.target as Node)) setShowA(false);
      if (containerRefB.current && !containerRefB.current.contains(event.target as Node)) setShowB(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="card" style={{ padding: "var(--space-xl)", background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderTop: "2px solid var(--accent-primary)" }}>
      <div style={{ marginBottom: "var(--space-md)", textAlign: "center" }}>
        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", margin: 0 }}>
          Search for any pairing among the <strong>Top 100 assets</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 items-center">
        
        {/* Token A Selector */}
        <div ref={containerRefA} style={{ position: "relative" }}>
          <label style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: "var(--space-xs)", display: "block", textTransform: "uppercase", letterSpacing: "1px" }}>First Token</label>
          <div 
            className="input-select" 
            onClick={() => setShowA(true)}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "8px", 
              padding: "12px", 
              background: "var(--bg-primary)", 
              border: "1px solid var(--border-color)", 
              borderRadius: "var(--radius-md)",
              cursor: "text"
            }}
          >
            <Search size={16} style={{ color: "var(--text-muted)" }} />
            <input 
              type="text" 
              placeholder="Search token..." 
              value={showA ? searchA : (selectedAToken?.name || "")}
              onChange={(e) => setSearchA(e.target.value)}
              onFocus={() => { setShowA(true); setSearchA(""); }}
              style={{ background: "transparent", border: "none", outline: "none", color: "white", width: "100%", fontSize: "var(--text-md)" }}
            />
          </div>
          {showA && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", marginTop: "4px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", maxHeight: "300px", overflowY: "auto" }}>
              {filteredA.map(token => (
                <div 
                  key={token.id} 
                  onClick={() => { setTokenA(token.id); setShowA(false); }}
                  style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", background: tokenA === token.id ? "rgba(255,183,0,0.1)" : "transparent" }}
                  className="hover-bg"
                >
                  <span style={{ fontWeight: 600 }}>{token.name}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>{token.symbol.toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Swap Button */}
        <button 
          onClick={handleSwap}
          className="btn-icon"
          style={{ 
            marginTop: "20px", 
            width: "40px", 
            height: "40px", 
            borderRadius: "50%", 
            background: "var(--bg-elevated)", 
            border: "1px solid var(--accent-primary)", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            color: "var(--accent-primary)",
            transition: "all 0.3s ease"
          }}
        >
          <ArrowRightLeft size={18} />
        </button>

        {/* Token B Selector */}
        <div ref={containerRefB} style={{ position: "relative" }}>
          <label style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: "var(--space-xs)", display: "block", textTransform: "uppercase", letterSpacing: "1px" }}>Second Token</label>
          <div 
            className="input-select" 
            onClick={() => setShowB(true)}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "8px", 
              padding: "12px", 
              background: "var(--bg-primary)", 
              border: "1px solid var(--border-color)", 
              borderRadius: "var(--radius-md)",
              cursor: "text"
            }}
          >
            <Search size={16} style={{ color: "var(--text-muted)" }} />
            <input 
              type="text" 
              placeholder="Search token..." 
              value={showB ? searchB : (selectedBToken?.name || "")}
              onChange={(e) => setSearchB(e.target.value)}
              onFocus={() => { setShowB(true); setSearchB(""); }}
              style={{ background: "transparent", border: "none", outline: "none", color: "white", width: "100%", fontSize: "var(--text-md)" }}
            />
          </div>
          {showB && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "var(--bg-elevated)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", marginTop: "4px", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", maxHeight: "300px", overflowY: "auto" }}>
              {filteredB.map(token => (
                <div 
                  key={token.id} 
                  onClick={() => { setTokenB(token.id); setShowB(false); }}
                  style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", background: tokenB === token.id ? "rgba(255,183,0,0.1)" : "transparent" }}
                  className="hover-bg"
                >
                  <span style={{ fontWeight: 600 }}>{token.name}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>{token.symbol.toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: "var(--space-xl)", display: "flex", justifyContent: "center" }}>
        <button 
          onClick={handleCompare}
          disabled={!tokenA || !tokenB || tokenA === tokenB}
          className="btn btn-primary"
          style={{ 
            width: "100%", 
            maxWidth: "300px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            gap: "10px",
            padding: "14px",
            fontSize: "var(--text-lg)",
            fontWeight: 700,
            boxShadow: (tokenA && tokenB && tokenA !== tokenB) ? "0 0 20px var(--accent-primary)44" : "none",
            opacity: (tokenA && tokenB && tokenA !== tokenB) ? 1 : 0.5
          }}
        >
          <Trophy size={20} /> Compare Tokens
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .input-select:focus-within {
          border-color: var(--accent-primary) !important;
          box-shadow: 0 0 10px var(--accent-primary)33;
        }
        .hover-bg:hover {
          background: rgba(255,255,255,0.05) !important;
        }
        .btn-icon:hover {
          background: var(--accent-primary) !important;
          color: var(--bg-primary) !important;
          transform: rotate(180deg);
        }
      `}} />
    </div>
  );
}
