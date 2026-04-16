
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TopGainerProps } from "./Root";

export const TopGainerUpdate: React.FC<TopGainerProps> = ({
  tokenName,
  symbol,
  price,
  priceChange24h,
  riskScore,
  marketCap,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animations
  const titleDrop = spring({ frame, fps, config: { damping: 12 } });
  
  // Staggered appearances
  const priceOpacity = interpolate(frame, [15, 30], [0, 1], { extrapolateRight: "clamp" });
  const priceY = interpolate(frame, [15, 30], [50, 0], { extrapolateRight: "clamp" });
  
  const riskOpacity = interpolate(frame, [45, 60], [0, 1], { extrapolateRight: "clamp" });
  
  // Format numbers
  const formattedPrice = price >= 1 ? price.toFixed(2) : price.toFixed(6);
  const formattedCap = marketCap >= 1e9 ? `$${(marketCap / 1e9).toFixed(2)}B` : `$${(marketCap / 1e6).toFixed(0)}M`;
  const isPositive = priceChange24h >= 0;

  return (
    <AbsoluteFill style={{ 
      backgroundColor: "#050505", 
      color: "#ffffff",
      fontFamily: "sans-serif",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      padding: "80px",
      backgroundImage: "radial-gradient(circle at center, #111 0%, #000 100%)"
    }}>
      {/* Dynamic Grid Background (Subtle) */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        opacity: 0.5,
        zIndex: 0
      }} />

      <div style={{ zIndex: 1, textAlign: 'center', width: '100%' }}>
        {/* Header */}
        <div style={{
          transform: `translateY(${interpolate(titleDrop, [0, 1], [-100, 0])}px)`,
          opacity: titleDrop,
          marginBottom: 60
        }}>
          <h2 style={{ color: "#888", fontSize: "40px", textTransform: "uppercase", letterSpacing: "8px", margin: 0 }}>
            Daily Breakout
          </h2>
          <h1 style={{ fontSize: "140px", margin: "20px 0", fontWeight: 900, textShadow: "0 0 40px rgba(255,255,255,0.3)" }}>
            {tokenName} <span style={{ color: "rgba(255,255,255,0.4)" }}>${symbol.toUpperCase()}</span>
          </h1>
        </div>

        {/* Price & Change */}
        <div style={{
          opacity: priceOpacity,
          transform: `translateY(${priceY}px)`,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "40px",
          padding: "60px 80px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "20px",
          marginBottom: 60,
          boxShadow: isPositive ? "0 0 100px rgba(0, 255, 128, 0.1)" : "0 0 100px rgba(255, 0, 64, 0.1)"
        }}>
          <div style={{ fontSize: "120px", fontWeight: "bold" }}>
            ${formattedPrice}
          </div>
          <div style={{ 
            fontSize: "80px", 
            fontWeight: "bold",
            color: isPositive ? "#00FFAA" : "#FF3366",
            display: 'flex',
            alignItems: 'center',
            gap: "10px"
          }}>
            {isPositive ? "▲" : "▼"} {Math.abs(priceChange24h).toFixed(2)}%
          </div>
        </div>

        {/* Footer Metrics (Risk Score) */}
        <div style={{
          opacity: riskOpacity,
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          padding: "0 40px"
        }}>
          <div style={{ textAlign: "left" }}>
            <div style={{ color: "#888", fontSize: "40px", marginBottom: "10px" }}>Market Cap</div>
            <div style={{ fontSize: "60px", fontWeight: "bold" }}>{formattedCap}</div>
          </div>
          
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#888", fontSize: "40px", marginBottom: "10px" }}>Risk Score</div>
            <div style={{ 
              fontSize: "60px", 
              fontWeight: "bold",
              color: riskScore <= 4 ? "#00FFAA" : riskScore <= 7 ? "#FFCC00" : "#FF3366"
            }}>
              {riskScore.toFixed(1)} / 10
            </div>
          </div>
        </div>

        {/* Call to action */}
        <div style={{
          position: "absolute",
          bottom: "100px",
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: interpolate(frame, [90, 105], [0, 1], { extrapolateRight: "clamp" }),
        }}>
          <div style={{ fontSize: "50px", color: "rgba(255,255,255,0.6)" }}>
            TokenRadar.co
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
