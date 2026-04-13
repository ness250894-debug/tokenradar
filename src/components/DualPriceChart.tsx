"use client";

import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Line,
  LineChart,
  ReferenceLine,
  Legend
} from "recharts";

interface PricePoint {
  date: string;
  price: number;
}

interface DualPriceChartProps {
  dataA: PricePoint[];
  dataB: PricePoint[];
  labelA: string;
  labelB: string;
  height?: number;
}

/**
 * Combined line chart for comparing two tokens.
 * Normalizes both tokens to % change relative to the start of the period.
 */
export function DualPriceChart({
  dataA,
  dataB,
  labelA,
  labelB,
  height = 300,
}: DualPriceChartProps) {
  if (!dataA?.length || !dataB?.length) {
    return (
      <div className="card" style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
        Price comparison data unavailable
      </div>
    );
  }

  // Normalize data to % change
  const baselineA = dataA[0].price;
  const baselineB = dataB[0].price;

  // Interleave data for Recharts (assuming dates are roughly aligned)
  const combinedData = dataA.map((pointA, i) => {
    const pointB = dataB[i] || dataB[dataB.length - 1]; // Fallback if lengths differ
    
    return {
      date: pointA.date,
      label: new Date(pointA.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      valA: ((pointA.price - baselineA) / baselineA) * 100,
      valB: ((pointB.price - baselineB) / baselineB) * 100,
    };
  });

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={combinedData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
          <XAxis 
            dataKey="label" 
            tickLine={false} 
            axisLine={false} 
            tick={{ fontSize: 10, fill: "var(--text-muted)" }} 
            interval="preserveStartEnd"
          />
          <YAxis 
            tickLine={false} 
            axisLine={false} 
            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            domain={['auto', 'auto']}
          />
          <Tooltip 
            contentStyle={{ 
              background: "var(--bg-card)", 
              border: "1px solid var(--border-color)", 
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-sm)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
            }}
            formatter={(val: any, name: any) => {
              const num = Number(val);
              if (isNaN(num)) return [String(val), name === "valA" ? labelA : labelB];
              return [
                `${num >= 0 ? "+" : ""}${num.toFixed(2)}%`, 
                name === "valA" ? labelA : labelB
              ];
            }}
          />
          <Legend 
            verticalAlign="top" 
            align="right" 
            wrapperStyle={{ paddingBottom: "10px", fontSize: "12px", fontWeight: 600 }}
          />
          <ReferenceLine y={0} stroke="var(--border-color)" strokeDasharray="3 3" />
          
          <Line 
            type="monotone" 
            dataKey="valA" 
            name={labelA}
            stroke="var(--accent-primary)" 
            strokeWidth={3} 
            dot={false}
            activeDot={{ r: 6, fill: "var(--accent-primary)" }}
            animationDuration={1500}
          />
          <Line 
            type="monotone" 
            dataKey="valB" 
            name={labelB}
            stroke="var(--blue)" 
            strokeWidth={3} 
            dot={false}
            activeDot={{ r: 6, fill: "var(--blue)" }}
            animationDuration={1500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
