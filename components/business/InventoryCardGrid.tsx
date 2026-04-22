"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { VirtuosoGrid } from "react-virtuoso";
import type { BusinessInventoryItem } from "@/types";
import {
  fmtCents,
  getDaysHeld,
  getDaysHeldColor,
  buildDisplayTitle,
  statusColor,
  statusLabel,
  getCompsUrl,
  getInventoryCertUrl,
  hasInventoryImage,
  getInventoryImageCandidates,
  isResolvingInventoryCertImage,
  isUnderwater,
  getProjectedMargin,
  formatMarginPct,
  getMarginColor,
} from "@/lib/business/inventory-display";

const VIRTUALIZE_THRESHOLD = 200;

type ConsultantAction = {
  label: string;
  style: { background: string; color: string; border: string };
  prompt: string;
};

type GridRow = { kind: "item"; item: BusinessInventoryItem } | { kind: "add" };

export interface InventoryCardGridProps {
  items: BusinessInventoryItem[];
  selectedItemId?: string | null;
  onItemClick: (item: BusinessInventoryItem) => void;
  onMarkSold?: (item: BusinessInventoryItem) => void;
  onDelete?: (item: BusinessInventoryItem) => void;
  ebayConnected?: boolean;
  onEbayList?: (item: BusinessInventoryItem) => void;
  onAddCard?: () => void;
  onConsultant?: (prompt: string) => void;
}

function getConsultantAction(item: BusinessInventoryItem): ConsultantAction {
  const mv = item.current_market_value_cents;
  const cost = item.cost_basis_total_cents;
  const days = getDaysHeld(item.acquisition_date);
  const listPrice = item.list_price_cents;
  const underwater = mv != null && mv < cost;
  const isUnlisted = item.status === "unlisted";
  const isListed = item.status === "listed";
  const listedTooLong = isListed && days != null && days > 21;
  const hasGoodMargin = mv != null && cost > 0 && mv > cost * 1.1;
  const title = buildDisplayTitle(item) || item.title || "this card";

  if (underwater) {
    return {
      label: "Underwater ↗",
      style: { background: "#FEF0F0", color: "#CC4444", border: "1px solid #F0C0C0" },
      prompt: `${title} is underwater — cost ${fmtCents(cost)}, MV ${fmtCents(mv)}. Cut losses or hold?`,
    };
  }
  if (isUnlisted && hasGoodMargin) {
    return {
      label: "List now ↗",
      style: { background: "#F0F8F4", color: "#2D7A4F", border: "1px solid #C8E6D6" },
      prompt: `Should I list ${title} now? Cost ${fmtCents(cost)}, est MV ${fmtCents(mv!)}.`,
    };
  }
  if (listedTooLong) {
    return {
      label: "Reprice ↗",
      style: { background: "#FBF5E8", color: "#8A5C0A", border: "1px solid #E8D5A0" },
      prompt: `${title} has been listed ${days}d at ${listPrice != null ? fmtCents(listPrice) : "unknown price"}. Should I reprice?`,
    };
  }
  return {
    label: "Analyze ↗",
    style: { background: "#F2EFE9", color: "#777777", border: "1px solid #E5E2DD" },
    prompt: `Analyze ${title} — cost ${fmtCents(cost)}, MV ${mv != null ? fmtCents(mv) : "unknown"}.`,
  };
}

function formatChannelLabel(channel: BusinessInventoryItem["channel"]): string | null {
  if (!channel) return null;
  switch (channel) {
    case "ebay":
      return "eBay";
    case "whatnot":
      return "Whatnot";
    default:
      return channel.charAt(0).toUpperCase() + channel.slice(1);
  }
}

function getConditionSummary(item: BusinessInventoryItem): string | null {
  if (item.condition_status !== "graded") return item.condition_status === "raw" ? "Raw" : null;
  const grader = item.grading_company?.trim().toUpperCase();
  const grade = item.grade?.trim();
  if (grader && grade) return `${grader} ${grade}`;
  if (grade) return grade;
  return "Graded";
}

function cleanActionLabel(label: string): string {
  return label.replace(/\s*↗$/, "");
}

function getVisibleInsight(action: ConsultantAction | null): ConsultantAction | null {
  if (!action) return null;
  return cleanActionLabel(action.label) === "Analyze" ? null : action;
}

function SnapshotStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#8B978F]">
        {label}
      </div>
      <div className={`mt-1 truncate text-[13px] font-semibold tabular-nums text-[var(--biz-text)] ${valueClassName ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

function MenuButtonIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 4.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm0 7a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm0 7a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
    </svg>
  );
}

function CardImageArea({
  item,
  menuButton,
}: {
  item: BusinessInventoryItem;
  menuButton: React.ReactNode;
}) {
  const imageCandidates = useMemo(() => getInventoryImageCandidates(item), [item]);
  const [imageIndex, setImageIndex] = useState(0);
  const imageUrl = imageCandidates[imageIndex] || null;
  const isResolving = isResolvingInventoryCertImage(item);

  useEffect(() => {
    setImageIndex(0);
  }, [item.id]);

  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-t-[20px] bg-[#F3F5F1]">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={buildDisplayTitle(item)}
          className="h-full w-full object-cover"
          onError={() => {
            setImageIndex((prev) => {
              const next = prev + 1;
              return next < imageCandidates.length ? next : imageCandidates.length;
            });
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center">
          <svg
            className="h-12 w-12 text-[#CAD2CB]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {isResolving ? (
            <p className="text-[12px] font-medium text-[var(--biz-primary)]">
              Resolving cert image...
            </p>
          ) : null}
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
        {item.quantity > 1 ? (
          <span className="rounded-full bg-[#111827]/72 px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
            Qty {item.quantity}
          </span>
        ) : (
          <span />
        )}
        {menuButton}
      </div>
    </div>
  );
}

function InventoryCardCell({
  item,
  selected,
  onItemClick,
  onMarkSold,
  onDelete,
  ebayConnected,
  onEbayList,
  onConsultant,
}: {
  item: BusinessInventoryItem;
  selected: boolean;
  onItemClick: (item: BusinessInventoryItem) => void;
  onMarkSold?: (item: BusinessInventoryItem) => void;
  onDelete?: (item: BusinessInventoryItem) => void;
  ebayConnected?: boolean;
  onEbayList?: (item: BusinessInventoryItem) => void;
  onConsultant?: (prompt: string) => void;
}) {
  const titleStr = buildDisplayTitle(item);
  const days = getDaysHeld(item.acquisition_date);
  const daysColor = getDaysHeldColor(days);
  const cost = fmtCents(item.cost_basis_total_cents) || "—";
  const listPrice = fmtCents(item.list_price_cents);
  const underwater = isUnderwater(item);
  const projected = getProjectedMargin(item);
  const hasEbayListing = Boolean((item as { ebay_item_id?: string | null }).ebay_item_id);
  const canListOnEbay =
    ebayConnected &&
    !hasEbayListing &&
    item.status !== "sold" &&
    item.status !== "returned" &&
    item.status !== "pending_sale";
  const hasImage = hasInventoryImage(item);
  const certUrl = getInventoryCertUrl(item);
  const isResolving = isResolvingInventoryCertImage(item);
  const consultantAction = onConsultant ? getConsultantAction(item) : null;
  const visibleInsight = getVisibleInsight(consultantAction);
  const conditionSummary = getConditionSummary(item);
  const channelSummary = formatChannelLabel(item.channel);
  const secondaryMeta = [conditionSummary, channelSummary].filter(Boolean).join(" • ");
  const marginMetric = projected
    ? {
        label: projected.basis === "list" ? "Margin" : "Margin est",
        value: formatMarginPct(projected.netPct),
        valueClassName: getMarginColor(projected.netCents),
      }
    : null;
  const metrics = [
    { label: "Cost", value: cost },
    ...(marginMetric ? [marginMetric] : []),
    {
      label: "Held",
      value: days !== null ? `${days}d` : "—",
      valueClassName: days !== null ? daysColor : undefined,
    },
  ];
  const metricsGridClass = metrics.length === 3 ? "grid-cols-3" : "grid-cols-2";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = `inventory-card-menu-${item.id}`;

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const openProfile = () => {
    setMenuOpen(false);
    onItemClick(item);
  };

  const openConsultant = () => {
    if (!consultantAction) return;
    setMenuOpen(false);
    onConsultant?.(consultantAction.prompt);
  };

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onItemClick(item);
  };

  const menuButton = (
    <button
      ref={menuButtonRef}
      type="button"
      aria-label={`More actions for ${titleStr || "inventory item"}`}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-controls={menuOpen ? menuId : undefined}
      onClick={(event) => {
        event.stopPropagation();
        setMenuOpen((prev) => !prev);
      }}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/60 bg-white/92 text-[#2A312D] shadow-sm backdrop-blur transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--biz-primary)]"
    >
      <MenuButtonIcon />
    </button>
  );

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${titleStr || "inventory item"} profile`}
        onClick={() => onItemClick(item)}
        onKeyDown={handleCardKeyDown}
        className={`group flex h-full cursor-pointer flex-col overflow-hidden rounded-[20px] border bg-white shadow-[0_2px_10px_rgba(16,24,20,0.03)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[#D4E4D8] hover:shadow-[0_16px_34px_rgba(16,24,20,0.08)] focus:outline-none focus:ring-2 focus:ring-[var(--biz-primary)] ${
          selected
            ? "border-[var(--biz-primary)] ring-1 ring-[var(--biz-primary)]"
            : "border-[#E4ECE5]"
        }`}
      >
        <CardImageArea item={item} menuButton={menuButton} />

        <div className="flex flex-1 flex-col gap-3 border-t border-[#EEF2EE] bg-white px-3.5 pb-3.5 pt-3">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`inline-flex shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold leading-none ${statusColor(item.status)}`}
              >
                {statusLabel(item.status)}
              </span>
              {item.status === "listed" && listPrice ? (
                <span className="text-[11px] font-semibold tabular-nums text-[var(--biz-text)]">
                  {listPrice}
                </span>
              ) : null}
            </div>
            <p
              className="mt-2 line-clamp-2 text-[13px] font-semibold leading-[1.25] text-[var(--biz-text)]"
              title={titleStr}
            >
              {titleStr || "Untitled"}
            </p>
            {secondaryMeta ? (
              <p className="mt-1 text-[11px] font-medium text-[var(--biz-muted)]">
                {secondaryMeta}
              </p>
            ) : null}
          </div>

          {visibleInsight ? (
            <div
              className="rounded-xl px-2.5 py-2 text-[11px] font-semibold"
              style={{
                background: visibleInsight.style.background,
                color: visibleInsight.style.color,
                border: visibleInsight.style.border,
              }}
            >
              {cleanActionLabel(visibleInsight.label)}
            </div>
          ) : underwater ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] font-semibold text-red-700">
              Underwater
            </div>
          ) : null}

          <div className={`grid gap-2 border-t border-[#EEF2EE] pt-3 ${metricsGridClass}`}>
            {metrics.map((metric) => (
              <SnapshotStat
                key={metric.label}
                label={metric.label}
                value={metric.value}
                valueClassName={metric.valueClassName}
              />
            ))}
          </div>
        </div>
      </div>

      {menuOpen ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Actions for ${titleStr || "inventory item"}`}
          onClick={(event) => event.stopPropagation()}
          className="absolute right-3 top-14 z-20 min-w-[188px] overflow-hidden rounded-2xl border border-[#DCE8DE] bg-white p-1.5 shadow-[0_18px_38px_rgba(16,24,20,0.14)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={openProfile}
            className="flex w-full items-center rounded-xl px-3 py-2 text-left text-[13px] font-medium text-[var(--biz-text)] transition-colors hover:bg-[#F5F8F4]"
          >
            Open profile
          </button>
          {item.status !== "sold" ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onMarkSold?.(item);
              }}
              className="flex w-full items-center rounded-xl px-3 py-2 text-left text-[13px] font-medium text-[var(--biz-text)] transition-colors hover:bg-[#F5F8F4]"
            >
              Mark sold
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onDelete?.(item);
            }}
            className="flex w-full items-center rounded-xl px-3 py-2 text-left text-[13px] font-medium text-[#B42318] transition-colors hover:bg-[#FEF3F2]"
          >
            Delete card
          </button>
          {canListOnEbay ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onEbayList?.(item);
              }}
              className="flex w-full items-center rounded-xl px-3 py-2 text-left text-[13px] font-medium text-[var(--biz-text)] transition-colors hover:bg-[#F5F8F4]"
            >
              List on eBay
            </button>
          ) : null}
          <a
            role="menuitem"
            href={getCompsUrl(item)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="flex w-full items-center rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--biz-text)] transition-colors hover:bg-[#F5F8F4]"
          >
            View comps
          </a>
          {!hasImage && !isResolving && certUrl ? (
            <a
              role="menuitem"
              href={certUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--biz-text)] transition-colors hover:bg-[#F5F8F4]"
            >
              View Cert
            </a>
          ) : null}
          {!hasImage && !isResolving ? (
            <Link
              href={`/card/${item.id}?from=business`}
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--biz-text)] transition-colors hover:bg-[#F5F8F4]"
            >
              Set image
            </Link>
          ) : null}
          {!hasImage && isResolving ? (
            <div className="rounded-xl border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)] px-3 py-2 text-[13px] font-medium text-[var(--biz-primary)]">
              Resolving cert image...
            </div>
          ) : null}
          {consultantAction ? (
            <>
              <div className="my-1 border-t border-[#EEF2EE]" />
              <button
                type="button"
                role="menuitem"
                onClick={openConsultant}
                className="flex w-full items-center rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-colors hover:opacity-90"
                style={{
                  background: consultantAction.style.background,
                  color: consultantAction.style.color,
                  border: consultantAction.style.border,
                }}
              >
                {cleanActionLabel(consultantAction.label)}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[172px] flex-col items-center justify-center gap-2 rounded-[20px] border-[1.5px] border-dashed border-[#DCE5DC] bg-[#FAFCF9] transition-colors hover:bg-[#F4F8F2]"
    >
      <span className="text-3xl leading-none text-[#C3CBC4]">+</span>
      <span className="text-[12px] font-medium text-[#94A097]">Add card</span>
    </button>
  );
}

const GRID_CLASS =
  "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

export default function InventoryCardGrid({
  items,
  selectedItemId,
  onItemClick,
  onMarkSold,
  onDelete,
  ebayConnected,
  onEbayList,
  onAddCard,
  onConsultant,
}: InventoryCardGridProps) {
  const rows: GridRow[] = useMemo(() => {
    const itemRows = items.map((item) => ({ kind: "item" as const, item }));
    if (onAddCard) return [...itemRows, { kind: "add" as const }];
    return itemRows;
  }, [items, onAddCard]);

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[var(--biz-muted)]">
        No inventory items found.
      </div>
    );
  }

  const cellProps = (item: BusinessInventoryItem) => ({
    item,
    selected: selectedItemId === item.id,
    onItemClick,
    onMarkSold,
    onDelete,
    ebayConnected,
    onEbayList,
    onConsultant,
  });

  const gridBody =
    rows.length > VIRTUALIZE_THRESHOLD ? (
      <VirtuosoGrid
        data={rows}
        listClassName={GRID_CLASS}
        style={{ height: "calc(100vh - 340px)", minHeight: 400 }}
        itemContent={(_index, row) =>
          row.kind === "add" ? (
            <AddTile key="__add__" onClick={onAddCard!} />
          ) : (
            <InventoryCardCell key={row.item.id} {...cellProps(row.item)} />
          )
        }
        computeItemKey={(_index, row) => (row.kind === "add" ? "__add__" : row.item.id)}
      />
    ) : (
      <div className={GRID_CLASS}>
        {rows.map((row) =>
          row.kind === "add" ? (
            <AddTile key="__add__" onClick={onAddCard!} />
          ) : (
            <InventoryCardCell key={row.item.id} {...cellProps(row.item)} />
          )
        )}
      </div>
    );

  return <div className="px-4 pb-6 pt-2 sm:px-6">{gridBody}</div>;
}
