"use client";

/**
 * recharts-dependent chart components for the financials page, isolated into
 * their own module so the (large) charting library is code-split out of the
 * page's initial bundle. The page imports these via next/dynamic.
 */
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AgingBucket } from "@/lib/business/financials";
import {
  AGING_COLORS,
  MONEY,
  MONEY_PRECISE,
  SERIES_COLORS,
  fmtMoneyCompact,
  type SeriesKey,
  type TrendDatum,
} from "./financialsFormat";

export function TrendChart({
  data,
  active,
  compact = false,
}: {
  data: TrendDatum[];
  active: Record<SeriesKey, boolean>;
  compact?: boolean;
}) {
  const fontSize = compact ? 10 : 12;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: compact ? 0 : 8 }}
      >
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_COLORS.revenue} stopOpacity={0.35} />
            <stop offset="100%" stopColor={SERIES_COLORS.revenue} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_COLORS.profit} stopOpacity={0.35} />
            <stop offset="100%" stopColor={SERIES_COLORS.profit} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1E2227" strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          stroke="#77808C"
          tick={{ fontSize }}
          tickLine={false}
          axisLine={{ stroke: "#24282D" }}
          interval={compact ? "preserveStartEnd" : 0}
          height={compact ? 18 : 28}
        />
        <YAxis
          yAxisId="left"
          stroke="#77808C"
          tick={{ fontSize }}
          tickFormatter={(v) => fmtMoneyCompact(v * 100)}
          tickLine={false}
          axisLine={{ stroke: "#24282D" }}
          width={compact ? 44 : 56}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          stroke="#77808C"
          tick={{ fontSize }}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
          tickLine={false}
          axisLine={{ stroke: "#24282D" }}
          width={compact ? 32 : 40}
        />
        <YAxis yAxisId="sales" orientation="right" hide />
        <Tooltip
          contentStyle={{
            background: "#0B0D0F",
            border: "1px solid #24282D",
            fontSize: 12,
            borderRadius: 0,
          }}
          labelStyle={{ color: "#B8C0CC" }}
          formatter={(value, name) => {
            const v = Number(value) || 0;
            const label = String(name);
            if (label === "Margin") return [`${v.toFixed(1)}%`, label];
            if (label === "Sales") return [v.toFixed(0), label];
            return [MONEY_PRECISE.format(v), label];
          }}
        />
        {active.sales ? (
          <Bar
            yAxisId="sales"
            dataKey="sales"
            name="Sales"
            fill={SERIES_COLORS.sales}
            fillOpacity={0.45}
            barSize={compact ? 8 : 14}
            isAnimationActive={false}
          />
        ) : null}
        {active.revenue ? (
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke={SERIES_COLORS.revenue}
            strokeWidth={2}
            fill="url(#revFill)"
            isAnimationActive={false}
          />
        ) : null}
        {active.profit ? (
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="profit"
            name="Profit"
            stroke={SERIES_COLORS.profit}
            strokeWidth={2}
            fill="url(#profitFill)"
            isAnimationActive={false}
          />
        ) : null}
        {active.margin ? (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="margin"
            name="Margin"
            stroke={SERIES_COLORS.margin}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export type AgingPieDatum = {
  name: string;
  value: number;
  count: number;
};

export function AgingPieChart({ pieData }: { pieData: AgingPieDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={44}
          outerRadius={68}
          stroke="#0B0D0F"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {pieData.map((entry) => (
            <Cell
              key={entry.name}
              fill={AGING_COLORS[entry.name as AgingBucket["label"]]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "#0B0D0F",
            border: "1px solid #24282D",
            fontSize: 12,
            borderRadius: 0,
          }}
          formatter={(value, _name, item) => {
            const v = Number(value) || 0;
            const payload = (item as { payload?: { count?: number; name?: string } } | undefined)?.payload;
            return [
              `${MONEY.format(v / 100)} (${payload?.count ?? 0} cards)`,
              `${payload?.name ?? ""} days`,
            ];
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
