"use client";

import { useState } from "react";
import { TokenGrid } from "./TokenGrid";
import { TgeGrid } from "./TgeGrid";
import { type TokenCardData } from "./TokenCard";
import { type UpcomingTge } from "@/lib/content-loader";

import { TrendingUp, Rocket } from "lucide-react";

interface HomeTabsProps {
  trackedTokens: TokenCardData[];
  upcomingTges: UpcomingTge[];
}

export function HomeTabs({ trackedTokens, upcomingTges }: HomeTabsProps) {
  const [activeTab, setActiveTab] = useState<"tracked" | "upcoming">("tracked");

  return (
    <div className="container" style={{ marginTop: "var(--space-2xl)" }}>
      <div className="tabs-container">
        <div
          className="tab-indicator"
          style={{
            width: "calc(50% - 4px)",
            transform: activeTab === "tracked" ? "translateX(0)" : "translateX(100%)",
          }}
        />
        <button className={`tab-btn ${activeTab === "tracked" ? "active" : ""}`} onClick={() => setActiveTab("tracked")}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <TrendingUp size={18} style={{ color: activeTab === "tracked" ? "var(--accent-primary)" : "var(--text-muted)" }} />
            <span>Tracked Tokens</span>
          </div>
          <span className="badge badge-accent">{trackedTokens.length}</span>
        </button>
        <button className={`tab-btn ${activeTab === "upcoming" ? "active" : ""}`} onClick={() => setActiveTab("upcoming")}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Rocket size={18} style={{ color: activeTab === "upcoming" ? "var(--accent-primary)" : "var(--text-muted)" }} />
            <span>Upcoming Launches</span>
          </div>
          <span className="badge badge-accent">{upcomingTges.length}</span>
        </button>
      </div>

      <div className="animate-in">
        {activeTab === "tracked" ? (
          <div key="tracked">
            <div className="section-header" style={{ textAlign: "center" }}>
              <h2>Market <span className="gradient-text">Overview</span></h2>
              <p>In-depth analysis for top established cryptocurrencies.</p>
            </div>
            <TokenGrid tokens={trackedTokens} />
          </div>
        ) : (
          <div key="upcoming">
            <div className="section-header" style={{ textAlign: "center" }}>
              <h2>Early <span className="gradient-text">Access</span></h2>
              <p>Exclusive Pre-Launch Spotlights for high-conviction projects.</p>
            </div>
            <TgeGrid tges={upcomingTges} />
          </div>
        )}
      </div>
    </div>
  );
}
