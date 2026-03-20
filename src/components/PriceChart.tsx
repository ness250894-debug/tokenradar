"use client";

import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

interface PricePoint {
  date: string;
  price: number;
}

interface PriceChartProps {
  /** Array of {date, price} data points */
  data: PricePoint[];
  /** Chart height in px */
  height?: number;
  /** Whether price trended up (green) or down (red) */
  isPositive?: boolean;
  /** Label for the period */
  label?: string;
}

/**
 * Lightweight area chart for displaying price history.
 * Uses recharts with responsive container, gradient fill, and minimal axes.
 */
export function PriceChart({
  data,
  height = 200,
  isPositive = true,
  label,
}: PriceChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="card"
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
        }}
      >
        No price data available
      </div>
    );
  }

  const color = isPositive ? "#00e676" : "#ff5252";
  const gradientId = `priceGradient-${label || "default"}`;

  // Format date labels
  const formattedData = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div>
      {label && (
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
            fontWeight: 600,
            textTransform: "uppercase" as const,
            letterSpacing: "0.06em",
            marginBottom: "var(--space-sm)",
          }}
        >
          {label}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={formattedData}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
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
            width={60}
            tickFormatter={(v: number) =>
              v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(2)}`
            }
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-sm)",
              color: "var(--text-primary)",
            }}
            formatter={(value: unknown) => {
              const num = Number(value);
              if (isNaN(num)) return [String(value), "Price"];
              return [`$${num.toFixed(num >= 1 ? 2 : 6)}`, "Price"];
            }}
            labelFormatter={(label: unknown) => String(label)}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
