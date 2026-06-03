"use client";

/**
 * recharts-dependent charts for the market-discount admin page, isolated so the
 * charting library is code-split out of the page's initial bundle. Imported via
 * next/dynamic from MarketDiscountAdminClient.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type DistributionRow = {
  series: string;
  median: number | null;
  count: number;
};

export type DeltaRow = {
  label: string;
  deltaPct: number;
};

export function DistributionMediansChart({ rows }: { rows: DistributionRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="series" stroke="#94a3b8" />
        <YAxis stroke="#94a3b8" />
        <Tooltip />
        <Bar dataKey="median" fill="#38bdf8" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DeltaChart({ rows }: { rows: DeltaRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="label" hide />
        <YAxis stroke="#94a3b8" />
        <Tooltip />
        <Bar dataKey="deltaPct" fill="#f59e0b" />
      </BarChart>
    </ResponsiveContainer>
  );
}
