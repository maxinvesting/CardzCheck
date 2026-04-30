"use client";

import { formatPrice } from "@/lib/pricing";
import type { MessageThread, NegotiationAnalysis } from "@/lib/messaging/types";
import type { MarketplaceReplyRecommendation } from "@/lib/messaging/reply-drafts";

function formatMoney(cents: number | null | undefined): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return formatPrice(cents / 100);
}

interface Props {
  thread: MessageThread;
  negotiation: NegotiationAnalysis | null;
  recommendation: MarketplaceReplyRecommendation;
}

export default function NegotiationPanel({
  thread,
  negotiation,
  recommendation,
}: Props) {
  const metrics = [
    { label: "Ask", value: formatMoney(thread.listing_price_cents) },
    {
      label: "Offer",
      value: formatMoney(thread.offer_amount_cents ?? negotiation?.offer_amount_cents),
    },
    {
      label: "Counter",
      value: formatMoney(thread.suggested_counter_cents ?? negotiation?.suggested_counter_cents),
    },
    {
      label: "Est. profit",
      value: formatMoney(thread.estimated_profit_cents ?? negotiation?.estimated_profit_cents),
    },
  ].filter((metric) => metric.value);

  if (metrics.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-[var(--biz-border)] bg-[var(--biz-surface)] px-5 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--biz-muted)]">
            Deal context
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--biz-text)]">
            {recommendation.headline}
          </p>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-[var(--biz-muted)]">
            {recommendation.reason}
          </p>
        </div>
        {thread.fee_percent != null ? (
          <span className="rounded-full border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--biz-muted)]">
            Fees {thread.fee_percent}%
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-2.5"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--biz-muted)]">
              {metric.label}
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--biz-text)]">
              {metric.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
