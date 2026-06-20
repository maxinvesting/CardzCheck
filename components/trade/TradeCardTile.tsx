"use client";

import type { ReactNode } from "react";
import { formatCents } from "@/lib/trade/format";
import type { TradeableCard } from "@/lib/trade/types";

/**
 * Presentational card tile used across the Trade Center (builder, binder,
 * browse, detail). Optionally selectable, with a corner badge slot.
 */
export default function TradeCardTile({
  card,
  selected = false,
  onToggle,
  corner,
  compact = false,
}: {
  card: Pick<
    TradeableCard,
    "player" | "title" | "year" | "grade" | "grading_company" | "image_url" | "estimated_value_cents"
  >;
  selected?: boolean;
  onToggle?: () => void;
  corner?: ReactNode;
  compact?: boolean;
}) {
  const subline = [card.year, card.title].filter(Boolean).join(" · ");
  const gradeLabel = [card.grading_company, card.grade].filter(Boolean).join(" ");
  const interactive = Boolean(onToggle);

  const Wrapper: "button" | "div" = interactive ? "button" : "div";

  return (
    <Wrapper
      {...(interactive ? { type: "button" as const, onClick: onToggle } : {})}
      className={`group relative flex flex-col overflow-hidden border text-left transition-colors ${
        selected
          ? "border-[color:var(--biz-primary)] ring-1 ring-[color:var(--biz-primary)]"
          : "border-[color:var(--biz-border)] hover:border-[color:var(--biz-border-strong)]"
      } bg-[color:var(--biz-surface-card)]`}
    >
      <div className="relative aspect-[5/7] overflow-hidden bg-[color:var(--biz-near-black)]">
        {card.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.image_url}
            alt={`${card.player ?? "Card"} ${card.year ?? ""}`.trim()}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-wide text-[color:var(--biz-faint)]">
            No image
          </div>
        )}
        {selected ? (
          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--biz-primary)] text-[color:var(--biz-primary-foreground)]">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        ) : null}
        {corner ? <div className="absolute left-1.5 top-1.5">{corner}</div> : null}
      </div>

      {!compact ? (
        <div className="flex flex-1 flex-col gap-0.5 p-2">
          <div className="truncate text-[12px] font-semibold text-[color:var(--biz-text-strong)]">
            {card.player || card.title || "Card"}
          </div>
          {subline ? (
            <div className="truncate text-[10px] text-[color:var(--biz-muted)]">{subline}</div>
          ) : null}
          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            {gradeLabel ? (
              <span className="text-[10px] text-[color:var(--biz-muted-strong)]">{gradeLabel}</span>
            ) : (
              <span className="text-[10px] text-[color:var(--biz-faint)]">Raw</span>
            )}
            <span className="text-[12px] font-semibold tabular-nums text-[color:var(--biz-text)]">
              {formatCents(card.estimated_value_cents)}
            </span>
          </div>
        </div>
      ) : null}
    </Wrapper>
  );
}
