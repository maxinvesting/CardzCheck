"use client";

import { useEffect, useMemo, useState } from "react";
import { computeNetPayout, formatMoney } from "@/lib/business/sales-utils";
import type { BusinessSale } from "@/types";
import {
  calculateNetProfit as calculateEseNetProfit,
  ESE_MAX_ITEM_VALUE,
  type ProfitBreakdown as EseProfitBreakdown,
  type StoreTier,
} from "@/lib/business/EbayProfitEngine";

type SaleFormPayload = {
  inventory_item_id?: string | null;
  channel: "ebay" | "whatnot" | "instagram" | "show" | "local" | "other";
  sold_at: string;
  sold_price_cents: number;
  shipping_charged_cents: number;
  platform_fees_cents: number;
  shipping_cost_cents: number;
  tax_cents: number;
  net_payout_cents: number | null;
  cogs_cents: number | null;
  notes: string | null;
  external_order_id: string | null;
  quantity_sold?: number;
};

interface Props {
  isOpen: boolean;
  title: string;
  submitLabel: string;
  defaults?: Partial<BusinessSale> & {
    inventory_item_id?: string | null;
    channel?: string | null;
    sold_at?: string | null;
  };
  onClose: () => void;
  onSubmit: (payload: SaleFormPayload) => Promise<void> | void;
  showCogsField?: boolean;
  /** Optional eBay store tier used for the ESE fee calculator when channel = "ebay". */
  storeTier?: StoreTier;
  /** Quantity available in inventory (lot size). When > 1, the form lets the user sell a partial quantity. */
  inventoryQuantity?: number;
  /** Total cost basis of the lot in cents — used to auto-prorate COGS for partial sales. */
  inventoryCostBasisCents?: number | null;
}

const CHANNEL_OPTIONS = [
  "ebay",
  "whatnot",
  "instagram",
  "show",
  "local",
  "other",
] as const;

const CHANNEL_LABELS: Record<string, string> = {
  ebay: "eBay",
  whatnot: "Whatnot",
  instagram: "Instagram",
  show: "Card Show",
  local: "Local",
  other: "Other",
};

const EBAY_FEE_RATE = 0.135; // 13.5% assumed eBay transaction fee

function centsToInput(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2);
}

function inputToCents(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 10);
  return dt.toISOString().slice(0, 10);
}

// Field styles — dark business theme
const fieldCls =
  "mt-1 w-full border border-[#343941] bg-[#090B0D] px-3 py-2 text-sm text-[#E6E8EB] placeholder:text-[#4F5863] outline-none focus:border-[#20B26B]";
const labelCls = "block text-xs font-medium text-[#77808C]";

export default function SaleFormModal({
  isOpen,
  title,
  submitLabel,
  defaults,
  onClose,
  onSubmit,
  showCogsField = true,
  storeTier = "none",
  inventoryQuantity = 1,
  inventoryCostBasisCents = null,
}: Props) {
  const [channel, setChannel] = useState<
    "ebay" | "whatnot" | "instagram" | "show" | "local" | "other"
  >("other");
  const [soldAt, setSoldAt] = useState(new Date().toISOString().slice(0, 10));
  const [soldPrice, setSoldPrice] = useState("");
  // Single shipping field — treated as both charged to buyer and cost to seller (pass-through)
  const [shipping, setShipping] = useState("");
  const [platformFees, setPlatformFees] = useState("");
  const [cogs, setCogs] = useState("");
  const [externalOrderId, setExternalOrderId] = useState("");
  const [notes, setNotes] = useState("");
  const [autoCalcNetPayout, setAutoCalcNetPayout] = useState(true);
  const [manualNetPayout, setManualNetPayout] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [eseWeightOz, setEseWeightOz] = useState<1 | 2 | 3>(1);
  /** Captured when the modal opens so submit always sends the link even if defaults change. */
  const [linkedInventoryItemId, setLinkedInventoryItemId] = useState<string | null>(null);
  const [quantitySold, setQuantitySold] = useState<string>("1");
  const [autoCogsByQuantity, setAutoCogsByQuantity] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;
    const defaultChannel = (defaults?.channel || "other").toLowerCase();
    const channelValue = CHANNEL_OPTIONS.includes(defaultChannel as never)
      ? (defaultChannel as typeof channel)
      : "other";

    setChannel(channelValue);
    setSoldAt(toDateInput(defaults?.sold_at));
    setSoldPrice(centsToInput(defaults?.sold_price_cents));
    // Initialise from whichever shipping field has a value
    const shippingInit =
      defaults?.shipping_charged_cents != null
        ? centsToInput(defaults.shipping_charged_cents)
        : centsToInput(defaults?.shipping_cost_cents);
    setShipping(shippingInit);
    setPlatformFees(centsToInput(defaults?.platform_fees_cents));
    setCogs(centsToInput(defaults?.cogs_cents));
    setExternalOrderId(defaults?.external_order_id || "");
    setNotes(defaults?.notes || "");

    const defaultAutoNet = defaults?.net_payout_cents == null;
    setAutoCalcNetPayout(defaultAutoNet);
    setManualNetPayout(centsToInput(defaults?.net_payout_cents));

    const invId = defaults?.inventory_item_id;
    setLinkedInventoryItemId(
      typeof invId === "string" && invId.trim() ? invId.trim() : null
    );
    setQuantitySold("1");
    setAutoCogsByQuantity(true);
  }, [defaults, isOpen]);

  // ── eBay: auto-estimate 13.5% platform fee ─────────────────────────────
  const ebayAutoFeesCents = useMemo(() => {
    if (channel !== "ebay") return 0;
    const priceCents = inputToCents(soldPrice);
    const shippingCents = inputToCents(shipping);
    return Math.round((priceCents + shippingCents) * EBAY_FEE_RATE);
  }, [channel, soldPrice, shipping]);

  // Use user-entered platform fees if provided; otherwise fall back to eBay auto-estimate
  const effectivePlatformFeesCents = useMemo(() => {
    if (platformFees.trim()) return inputToCents(platformFees);
    return ebayAutoFeesCents;
  }, [platformFees, ebayAutoFeesCents]);

  const computedNetPayoutCents = useMemo(
    () =>
      computeNetPayout({
        sold_price_cents: inputToCents(soldPrice),
        // shipping charged = shipping cost → they cancel out in the formula
        shipping_charged_cents: inputToCents(shipping),
        platform_fees_cents: effectivePlatformFeesCents,
        shipping_cost_cents: inputToCents(shipping),
        tax_cents: 0,
      }),
    [effectivePlatformFeesCents, shipping, soldPrice]
  );

  // ── eBay Standard Envelope — only when eBay + price ≤ $20 ──────────────
  const soldPriceNum = Number.parseFloat(soldPrice);
  const showEse =
    channel === "ebay" &&
    Number.isFinite(soldPriceNum) &&
    soldPriceNum > 0 &&
    soldPriceNum <= ESE_MAX_ITEM_VALUE;

  // ── Quantity sold + proportional COGS auto-fill ─────────────────────────
  const maxQuantity = Math.max(1, Math.floor(inventoryQuantity));
  const parsedQuantity = useMemo(() => {
    const n = Number.parseInt(quantitySold, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, maxQuantity);
  }, [quantitySold, maxQuantity]);
  const isPartialSale = parsedQuantity < maxQuantity;

  // When auto-COGS is on and we have a linked inventory item with a basis,
  // pro-rate COGS as basis * (qty_sold / qty_total).
  useEffect(() => {
    if (!autoCogsByQuantity) return;
    if (inventoryCostBasisCents == null || maxQuantity < 1) return;
    const proRated = Math.round(
      (inventoryCostBasisCents * parsedQuantity) / maxQuantity
    );
    setCogs(centsToInput(proRated));
  }, [autoCogsByQuantity, inventoryCostBasisCents, maxQuantity, parsedQuantity]);

  const eseEstimate: EseProfitBreakdown | null = useMemo(() => {
    if (!showEse) return null;
    try {
      return calculateEseNetProfit({
        itemPrice: soldPriceNum,
        weightOz: eseWeightOz,
        storeTier,
      });
    } catch {
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEse, soldPriceNum, eseWeightOz, storeTier]);

  if (!isOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!soldPrice.trim()) return;

    const payload: SaleFormPayload = {
      inventory_item_id: linkedInventoryItemId,
      channel,
      sold_at: soldAt,
      sold_price_cents: inputToCents(soldPrice),
      shipping_charged_cents: inputToCents(shipping),
      platform_fees_cents: effectivePlatformFeesCents,
      shipping_cost_cents: inputToCents(shipping),
      tax_cents: 0,
      net_payout_cents: autoCalcNetPayout ? null : inputToCents(manualNetPayout),
      cogs_cents: showCogsField
        ? inputToCents(cogs)
        : defaults?.cogs_cents ?? null,
      notes: notes.trim() ? notes.trim() : null,
      external_order_id: externalOrderId.trim() ? externalOrderId.trim() : null,
      quantity_sold: maxQuantity > 1 ? parsedQuantity : undefined,
    };

    setSubmitting(true);
    try {
      await onSubmit(payload);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden border border-[#24282D] bg-[#0F1317] shadow-2xl">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between border-b border-[#24282D] px-5 py-4">
          <h2 className="text-sm font-semibold leading-snug text-[#E6E8EB] pr-4">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-2 text-xl leading-none text-[#77808C] hover:text-[#E6E8EB]"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-5">

          {maxQuantity > 1 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <label className="flex-1 min-w-[140px]">
                  <span className={labelCls}>
                    Quantity sold
                    <span className="ml-1 text-emerald-700 font-semibold">
                      / {maxQuantity} on hand
                    </span>
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={maxQuantity}
                    step={1}
                    value={quantitySold}
                    onChange={(e) => setQuantitySold(e.target.value)}
                    className={fieldCls}
                  />
                </label>
                {inventoryCostBasisCents != null && inventoryCostBasisCents > 0 && (
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 pb-2">
                    <input
                      type="checkbox"
                      checked={autoCogsByQuantity}
                      onChange={(e) => setAutoCogsByQuantity(e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Pro-rate COGS by quantity
                  </label>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-emerald-700">
                {isPartialSale
                  ? `Selling ${parsedQuantity} of ${maxQuantity}. Remaining ${maxQuantity - parsedQuantity} will stay in inventory.`
                  : `Selling all ${maxQuantity}. The lot will be marked sold.`}
              </p>
            </div>
          )}

          {/* ── Row 1: Price · Channel · Date ─────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label>
              <span className={labelCls}>Sold Price ($)</span>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={soldPrice}
                onChange={(e) => setSoldPrice(e.target.value)}
                className={fieldCls}
                placeholder="0.00"
              />
            </label>
            <label>
              <span className={labelCls}>Channel</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as typeof channel)}
                className={fieldCls}
              >
                {CHANNEL_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {CHANNEL_LABELS[opt] ?? opt}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelCls}>Sold Date</span>
              <input
                type="date"
                value={soldAt}
                onChange={(e) => setSoldAt(e.target.value)}
                className={fieldCls}
              />
            </label>
          </div>

          {/* ── Row 2: Shipping · Platform fees ─────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className={labelCls}>Shipping ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={shipping}
                onChange={(e) => setShipping(e.target.value)}
                className={fieldCls}
                placeholder="0.00"
              />
            </label>
            <div>
              <span className={labelCls}>
                Platform Fees ($)
                {channel === "ebay" && !platformFees.trim() && (
                  <span className="ml-1 text-emerald-600 font-semibold">13.5% est.</span>
                )}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={platformFees}
                onChange={(e) => setPlatformFees(e.target.value)}
                className={fieldCls}
                placeholder={
                  channel === "ebay"
                    ? centsToInput(ebayAutoFeesCents) || "0.00"
                    : "0.00"
                }
              />
            </div>
          </div>

          {/* ── eBay info strip ────────────────────────────────────────── */}
          {channel === "ebay" && (
            <div className="border border-[#1D3A60] bg-[#0A1929] px-3 py-2 text-xs text-[#60A0DC]">
              <p>
                <span className="font-semibold">Platform fees</span> estimated at{" "}
                <span className="font-bold">13.5%</span> of sale + shipping. Override the field above if you know the exact amount.
              </p>
            </div>
          )}

          {/* ── Estimated net payout ───────────────────────────────────── */}
          <label className="inline-flex items-center gap-2 text-xs font-medium text-[#77808C]">
            <input
              type="checkbox"
              checked={autoCalcNetPayout}
              onChange={(e) => setAutoCalcNetPayout(e.target.checked)}
              className="border-[#343941] bg-[#090B0D] text-[#20B26B] focus:ring-[#20B26B]"
            />
            Auto-calculate net payout
          </label>

          {autoCalcNetPayout ? (
            <div className="flex items-center justify-between border border-[#1F5F45] bg-[#0E251B] px-4 py-3">
              <div>
                <p className="text-xs font-medium text-[#20B26B]">Estimated net payout</p>
                <p className="text-[11px] text-[#20B26B]/60 mt-0.5">
                  Sale + shipping − fees − shipping cost
                  {channel === "ebay" && !platformFees.trim() && " (13.5% eBay fee assumed)"}
                </p>
              </div>
              <p className="text-xl font-bold text-[#20B26B]">
                {formatMoney(computedNetPayoutCents)}
              </p>
            </div>
          ) : (
            <label>
              <span className={labelCls}>Net Payout ($)</span>
              <input
                type="number"
                step="0.01"
                value={manualNetPayout}
                onChange={(e) => setManualNetPayout(e.target.value)}
                className={fieldCls}
                placeholder="0.00"
              />
            </label>
          )}

          {/* ── eBay Standard Envelope (only for eBay + price ≤ $20) ────── */}
          {showEse && (
            <div className="border border-[#24282D] bg-[#090B0D] px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#B8C0CC]">
                  eBay Standard Envelope
                  <span className="ml-1.5 font-normal text-[#77808C]">
                    (under ${ESE_MAX_ITEM_VALUE.toFixed(0)} items)
                  </span>
                </p>
                <label className="flex items-center gap-1.5 text-[11px] text-[#77808C]">
                  Weight
                  <select
                    value={eseWeightOz}
                    onChange={(e) => setEseWeightOz(Number(e.target.value) as 1 | 2 | 3)}
                    className="border border-[#343941] bg-[#090B0D] px-1.5 py-0.5 text-[11px] text-[#E6E8EB] outline-none"
                  >
                    <option value={1}>1 oz</option>
                    <option value={2}>2 oz</option>
                    <option value={3}>3 oz</option>
                  </select>
                </label>
              </div>

              {eseEstimate && (
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="text-[#77808C]">eBay fees</div>
                    <div className="font-semibold text-[#B8C0CC]">
                      ${eseEstimate.totalEbayFees.toFixed(2)}
                      <span className="text-[#77808C] font-normal ml-1">
                        ({(eseEstimate.fvfRate * 100).toFixed(1)}% + ${eseEstimate.perOrderFee.toFixed(2)})
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[#77808C]">Shipping + pkg</div>
                    <div className="font-semibold text-[#B8C0CC]">
                      ${eseEstimate.shippingCost.toFixed(2)}
                      <span className="text-[#77808C] font-normal ml-1">+ ${eseEstimate.packagingTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[#77808C]">Net profit (pre-COGS)</div>
                    <div className={`font-bold ${eseEstimate.isLoss ? "text-[#E05C5C]" : "text-[#20B26B]"}`}>
                      ${eseEstimate.netProfit.toFixed(2)}
                      <span className="text-[#77808C] font-normal ml-1">({eseEstimate.netMarginPct.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Whatnot helper ─────────────────────────────────────────── */}
          {channel === "whatnot" && (
            <div className="border border-[#3A2A5A] bg-[#1A0F2A] px-3 py-2.5 text-xs">
              <p className="font-semibold text-[#C09AF0] mb-1.5">Recording a Whatnot sale</p>
              <ol className="list-decimal list-inside space-y-1 text-[#77808C]">
                <li>Find the order in <span className="font-medium text-[#B8C0CC]">Whatnot Seller Dashboard → Orders</span></li>
                <li><span className="font-medium text-[#B8C0CC]">Sold Price</span> — the hammer price the buyer paid</li>
                <li><span className="font-medium text-[#B8C0CC]">Platform Fees</span> — Whatnot seller fee (~9.5%) + 2.9% payment processing; see "Fee Breakdown"</li>
                <li><span className="font-medium text-[#B8C0CC]">External Order ID</span> — paste the Whatnot order number to prevent duplicates</li>
              </ol>
            </div>
          )}

          {/* ── COGS ──────────────────────────────────────────────────── */}
          {showCogsField && (
            <label>
              <span className={labelCls}>Cost of Goods ($)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cogs}
                onChange={(e) => setCogs(e.target.value)}
                className={fieldCls}
                placeholder="0.00"
              />
            </label>
          )}

          {/* ── External Order ID + Notes ──────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label>
                <span className={labelCls}>External Order ID</span>
                <input
                  type="text"
                  value={externalOrderId}
                  onChange={(e) => setExternalOrderId(e.target.value)}
                  className={fieldCls}
                  placeholder="Optional"
                />
              </label>
              <p className="mt-1 text-[11px] text-gray-400">
                Must be unique per business. Leave blank if not tracking.
              </p>
            </div>
            <label>
              <span className={labelCls}>Notes</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={fieldCls}
                placeholder="Optional"
              />
            </label>
          </div>

          {/* ── Actions ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-2 border-t border-[#24282D] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="border border-[#343941] px-4 py-2 text-sm font-medium text-[#B8C0CC] hover:text-[#E6E8EB] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !soldPrice.trim()}
              className="border border-[#20B26B] bg-[#20B26B] px-5 py-2 text-sm font-bold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50 transition-colors"
            >
              {submitting ? "Saving…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
