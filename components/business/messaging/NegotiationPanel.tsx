"use client";

import type { NegotiationAnalysis } from "@/lib/messaging/types";

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

const ACTION_STYLES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  accept: { label: "Accept", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  counter: { label: "Counter", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  hold_firm: { label: "Hold Firm", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  decline: { label: "Decline", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
};

interface Props {
  analysis: NegotiationAnalysis;
}

export default function NegotiationPanel({ analysis }: Props) {
  const action = ACTION_STYLES[analysis.recommended_action] ?? ACTION_STYLES.counter;
  const profitPositive = analysis.estimated_profit_cents > 0;

  return (
    <div className="border-b border-[var(--biz-border)] bg-[#FAFBFC] px-5 py-3">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-[var(--biz-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs font-semibold text-[var(--biz-text)]">Negotiation Intelligence</span>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold ${action.bg} ${action.text} ${action.border}`}>
          Recommended: {action.label}
        </span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 mb-3">
        <MetricCell label="Offer" value={fmt(analysis.offer_amount_cents)} />
        <MetricCell label="List Price" value={fmt(analysis.listing_price_cents)} />
        <MetricCell label="Cost Basis" value={fmt(analysis.cost_basis_cents)} />
        <MetricCell label="eBay Fees" value={`${analysis.fee_percent}%`} />
        <MetricCell label="Est. Net" value={fmt(analysis.estimated_net_cents)} />
        <MetricCell
          label="Est. Profit"
          value={fmt(analysis.estimated_profit_cents)}
          valueColor={profitPositive ? "text-emerald-600" : "text-red-600"}
        />
      </div>

      {/* Suggested counter */}
      {analysis.suggested_counter_cents != null && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-[var(--biz-muted)]">Suggested counter:</span>
          <span className="text-sm font-semibold text-[var(--biz-primary)]">
            {fmt(analysis.suggested_counter_cents)}
          </span>
        </div>
      )}

      {/* Reasoning */}
      <p className="text-[11px] leading-relaxed text-[var(--biz-muted)]">
        {analysis.reasoning}
      </p>
    </div>
  );
}

function MetricCell({
  label,
  value,
  valueColor = "text-[var(--biz-text)]",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-md border border-[var(--biz-border)] bg-white px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-wide text-[var(--biz-muted)]">{label}</p>
      <p className={`mt-0.5 text-xs font-semibold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}
