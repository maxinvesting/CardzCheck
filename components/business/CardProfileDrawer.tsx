"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CardImage } from "@/components/CardImage";
import CardPhotoUploader from "@/components/business/CardPhotoUploader";
import TargetsSection from "@/components/business/TargetsSection";
import {
  buildMarketplaceLinks,
  MARKETPLACE_TYPE_LABELS,
  type MarketplaceLink,
} from "@/lib/comps/marketplace-urls";
import type { BusinessInventoryItem, TrustedCardImage } from "@/types";

interface ProfileLikeItem {
  id: string;
  player_name?: string | null;
  year?: string | number | null;
  set_name?: string | null;
  parallel_type?: string | null;
  card_number?: string | null;
  grading_company?: string | null;
  grade?: string | number | null;
  cert_number?: string | null;
  psa_cert_number?: string | null;
  cost_basis_total_cents?: number | null;
  tax_cents?: number | null;
  shipping_cents?: number | null;
  fees_paid_cents?: number | null;
  list_price_cents?: number | null;
  current_market_value_cents?: number | null;
  estimated_cmv?: number | null;
  est_cmv?: number | null;
  last_known_price_cents?: number | null;
  quantity?: number | null;
  channel?: string | null;
  status?: string | null;
  condition_status?: string | null;
  acquisition_type?: string | null;
  location?: string | null;
  title?: string | null;
  notes?: string | null;
  trusted_image?: TrustedCardImage | null;
  image_url?: string | null;
  user_image_url?: string | null;
  primary_image?: { image_url?: string | null } | null;
  acquisition_date?: string | null;
  created_at?: string | null;
}

interface SaleSummary {
  id?: string;
  sold_at?: string | null;
  sale_date?: string | null;
  sold_price_cents?: number | null;
  sale_price_cents?: number | null;
  net_payout_cents?: number | null;
  profit_cents?: number | null;
  channel?: string | null;
}

interface Props {
  /** Pre-loaded item — opens immediately. Accepts business inventory or
   *  personal collection items; both are coerced to ProfileLikeItem. */
  item?: unknown;
  /** If you only have an id, the drawer fetches `/api/card-profile/[id]`. */
  itemId?: string | null;
  mode?: "business" | "collection";
  isOpen: boolean;
  onClose: () => void;
  /** Optional callbacks — when omitted, the matching action button is hidden. */
  onMarkSold?: (item: BusinessInventoryItem) => void;
  onTrade?: (item: BusinessInventoryItem) => void;
  onList?: (item: BusinessInventoryItem) => void;
  onDelete?: (item: BusinessInventoryItem) => void;
  /** Called after an inline edit is saved, so parents can sync their state. */
  onSaved?: (item: BusinessInventoryItem) => void;
}

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function fmtCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return MONEY.format(cents / 100);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function gradeLabel(item: ProfileLikeItem): string {
  const company = item.grading_company?.trim();
  const grade = item.grade != null ? String(item.grade).trim() : "";
  if (company && grade) return `${company} ${grade}`;
  if (grade) return grade;
  if (company) return company;
  return "Raw";
}

function metaLine(item: ProfileLikeItem): string {
  return [item.year, item.set_name, item.card_number ? `#${item.card_number}` : null, item.parallel_type]
    .filter(Boolean)
    .join(" · ");
}

function buildCompareListingsUrl(item: ProfileLikeItem): string {
  const params = new URLSearchParams();
  if (item.player_name) params.set("player", item.player_name);
  if (item.year != null) params.set("year", String(item.year));
  if (item.set_name) params.set("set", item.set_name);
  if (item.parallel_type) params.set("parallel_type", item.parallel_type);
  if (item.card_number) params.set("card_number", String(item.card_number));
  const grader = item.grading_company?.trim();
  const grade = item.grade != null ? String(item.grade).trim() : "";
  if (grader && grade) params.set("grade", `${grader} ${grade}`);
  else if (grade) params.set("grade", grade);
  const qs = params.toString();
  return qs ? `/business/comps?${qs}` : "/business/comps";
}

function pickEstimatedCents(item: ProfileLikeItem): number | null {
  if (typeof item.last_known_price_cents === "number") return item.last_known_price_cents;
  if (typeof item.estimated_cmv === "number") return Math.round(item.estimated_cmv * 100);
  if (typeof item.est_cmv === "number") return Math.round(item.est_cmv * 100);
  return null;
}

export default function CardProfileDrawer({
  item: initialItem,
  itemId,
  mode = "business",
  isOpen,
  onClose,
  onMarkSold,
  onTrade,
  onList,
  onDelete,
  onSaved,
}: Props) {
  const initialNarrowed = (initialItem ?? null) as ProfileLikeItem | null;
  const [item, setItem] = useState<ProfileLikeItem | null>(initialNarrowed);
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (initialItem) {
      setItem(initialItem as ProfileLikeItem);
    }
  }, [initialItem]);

  useEffect(() => {
    if (!isOpen) return;
    const narrowed = (initialItem ?? null) as ProfileLikeItem | null;
    const fetchId = itemId ?? narrowed?.id;
    if (!fetchId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/card-profile/${fetchId}?from=${mode}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? "Failed to load card");
          return;
        }
        if (data?.item) setItem(data.item as ProfileLikeItem);
        if (Array.isArray(data?.sales)) setSales(data.sales as SaleSummary[]);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load card");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, itemId, initialItem, mode]);

  const marketplaceLinks = useMemo<MarketplaceLink[]>(() => {
    if (!item?.player_name) return [];
    return buildMarketplaceLinks({
      playerName: item.player_name,
      year: item.year != null ? String(item.year) : null,
      setName: item.set_name ?? null,
      grade: item.grade != null ? String(item.grade) : null,
      gradingCompany: item.grading_company ?? null,
      parallelType: item.parallel_type ?? null,
    });
  }, [item]);

  const pnlCents = useMemo(() => {
    if (!item) return null;
    const cmv = pickEstimatedCents(item);
    const cost = typeof item.cost_basis_total_cents === "number" ? item.cost_basis_total_cents : null;
    if (cmv == null || cost == null) return null;
    return cmv - cost;
  }, [item]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) setEditing(false);
  }, [isOpen]);

  useEffect(() => {
    setEditing(false);
  }, [itemId]);

  if (!isOpen) return null;

  const image: TrustedCardImage | null | undefined =
    (item?.trusted_image as TrustedCardImage | null | undefined) ??
    (item?.user_image_url
      ? ({ kind: "user_upload", url: item.user_image_url } as unknown as TrustedCardImage)
      : item?.image_url
        ? ({ kind: "external", url: item.image_url } as unknown as TrustedCardImage)
        : null);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Card profile"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden border border-[#24282D] bg-[#0B0D0F] text-[#E6E8EB] shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[#24282D] px-5 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
              Card profile
            </div>
            <h2 className="mt-0.5 truncate text-base font-semibold text-[#E6E8EB]">
              {item?.player_name ?? (loading ? "Loading…" : "Card")}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-1 text-[#77808C] hover:text-[#E6E8EB]"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Body */}
        {error ? (
          <div className="m-4 border border-[#723030] bg-[#2A1111] p-3 text-xs text-[#E05C5C]">
            {error}
          </div>
        ) : null}

        {item && editing && mode === "business" ? (
          <InventoryEditForm
            item={item}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => {
              setItem((prev) => ({ ...(prev ?? {}), ...updated }) as ProfileLikeItem);
              setEditing(false);
              onSaved?.(updated);
            }}
          />
        ) : item ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr]">
            {/* Left column: identity, stats, actions */}
            <div className="flex min-h-0 flex-col overflow-y-auto border-b border-[#24282D] p-5 md:border-b-0 md:border-r">
              <div className="aspect-[3/4] w-full overflow-hidden border border-[#24282D] bg-[#0F1317]">
                <CardImage
                  image={image}
                  alt={item.player_name ?? "Card"}
                  className="h-full w-full"
                  imageClassName="h-full w-full object-cover"
                  fallbackClassName="h-full w-full"
                />
              </div>

              <div className="mt-3 text-[10px] uppercase tracking-wide text-[#77808C]">
                {gradeLabel(item)}
                {item.cert_number || item.psa_cert_number ? (
                  <span className="ml-2 text-[#5A626E]">
                    Cert {item.cert_number ?? item.psa_cert_number}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-sm font-semibold leading-tight text-[#E6E8EB]">
                {item.player_name ?? "—"}
              </div>
              <div className="mt-0.5 text-[11px] text-[#77808C]">{metaLine(item) || "—"}</div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <Stat label="Cost basis" value={fmtCents(item.cost_basis_total_cents)} />
                <Stat label="CMV" value={fmtCents(pickEstimatedCents(item))} />
                <EditablePriceStat
                  label="Your price"
                  cents={item.list_price_cents ?? null}
                  disabled={mode !== "business"}
                  onSave={async (next) => {
                    if (!item) return;
                    const res = await fetch("/api/business/inventory", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: item.id, list_price_cents: next }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => null);
                      throw new Error(data?.error || "Failed to save");
                    }
                    const updated = await res.json();
                    setItem((prev) =>
                      prev ? { ...prev, list_price_cents: updated.list_price_cents } : prev
                    );
                  }}
                />
                <Stat
                  label="Est. P&L"
                  value={fmtCents(pnlCents)}
                  tone={
                    pnlCents == null
                      ? "neutral"
                      : pnlCents > 0
                        ? "positive"
                        : pnlCents < 0
                          ? "negative"
                          : "neutral"
                  }
                />
                <Stat label="Channel" value={item.channel ?? "—"} />
                <Stat label="Status" value={item.status ?? "—"} />
              </dl>

              {/* Actions */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {mode === "business" ? (
                  <ActionButton onClick={() => setEditing(true)} primary>
                    Edit
                  </ActionButton>
                ) : null}
                <Link
                  href={buildCompareListingsUrl(item)}
                  onClick={onClose}
                  className="inline-flex items-center justify-center border border-[#343941] bg-[#0F1317] px-3 py-1.5 text-xs font-medium text-[#B8C0CC] transition hover:border-[#5A626E] hover:text-[#E6E8EB]"
                >
                  Compare
                </Link>
                {onMarkSold && item.status !== "sold" ? (
                  <ActionButton onClick={() => onMarkSold(item as BusinessInventoryItem)}>
                    Mark sold
                  </ActionButton>
                ) : null}
                {onTrade && item.status !== "sold" ? (
                  <ActionButton onClick={() => onTrade(item as BusinessInventoryItem)}>
                    Trade
                  </ActionButton>
                ) : null}
                {onList ? (
                  <ActionButton onClick={() => onList(item as BusinessInventoryItem)} accent>
                    List on CardzCheck
                  </ActionButton>
                ) : null}
                {onDelete ? (
                  <ActionButton
                    onClick={() => onDelete(item as BusinessInventoryItem)}
                    tone="danger"
                  >
                    Delete
                  </ActionButton>
                ) : null}
              </div>

              <div className="mt-4 space-y-0.5 text-[10px] text-[#5A626E]">
                {item.acquisition_date ? <div>Acquired {fmtDate(item.acquisition_date)}</div> : null}
                {item.created_at ? <div>Added {fmtDate(item.created_at)}</div> : null}
                {item.quantity ? <div>Qty {item.quantity}</div> : null}
              </div>
            </div>

            {/* Right column: targets, comps, notes, sales */}
            <div className="min-h-0 overflow-y-auto">
              {mode === "business" ? (
                <TargetsSection
                  inventoryItemId={item.id}
                  cmvCents={pickEstimatedCents(item)}
                  listPriceCents={item.list_price_cents ?? null}
                />
              ) : null}

              {marketplaceLinks.length > 0 ? (
                <section className="border-b border-[#24282D] px-4 py-3">
                  <div className="flex items-baseline justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77808C]">
                      Comps across platforms
                    </div>
                    <div className="text-[10px] text-[#5A626E]">Opens in new tab</div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 lg:grid-cols-3">
                    {marketplaceLinks.map((link) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between gap-1 border border-[#24282D] bg-[#0F1317] px-2 py-1.5 transition-colors hover:border-[#5A626E]"
                        style={{ borderLeft: `2px solid ${link.accentColor}` }}
                        title={link.tagline}
                      >
                        <span className="truncate text-[11px] font-medium text-[#E6E8EB]">
                          {link.name}
                        </span>
                        <span className="shrink-0 text-[8px] font-semibold uppercase tracking-wide text-[#5A626E] group-hover:text-[#B8C0CC]">
                          {MARKETPLACE_TYPE_LABELS[link.type]}
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              {item.notes ? (
                <section className="border-b border-[#24282D] px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77808C]">
                    Notes
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] text-[#B8C0CC]">{item.notes}</p>
                </section>
              ) : null}

              {sales.length > 0 ? (
                <section className="px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77808C]">
                    Recent sales ({sales.length})
                  </div>
                  <ul className="mt-1 divide-y divide-[#1E2227]">
                    {sales.slice(0, 4).map((sale, idx) => (
                      <li key={sale.id ?? idx} className="flex items-center justify-between py-1.5 text-[11px]">
                        <div className="text-[#77808C]">
                          {fmtDate(sale.sold_at ?? sale.sale_date)}
                          {sale.channel ? <span className="ml-2 text-[#5A626E]">· {sale.channel}</span> : null}
                        </div>
                        <div className="text-right tabular-nums">
                          <div className="text-[#E6E8EB]">
                            {fmtCents(sale.sold_price_cents ?? sale.sale_price_cents)}
                          </div>
                          {sale.profit_cents != null ? (
                            <div
                              className={
                                sale.profit_cents > 0
                                  ? "text-[#20B26B]"
                                  : sale.profit_cents < 0
                                    ? "text-[#E05C5C]"
                                    : "text-[#5A626E]"
                              }
                            >
                              {fmtCents(sale.profit_cents)}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center p-10 text-xs text-[#77808C]">
            Loading card…
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const valueClass =
    tone === "positive"
      ? "text-[#20B26B]"
      : tone === "negative"
        ? "text-[#E05C5C]"
        : "text-[#E6E8EB]";
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[#77808C]">{label}</dt>
      <dd className={`tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}

function EditablePriceStat({
  label,
  cents,
  onSave,
  disabled = false,
}: {
  label: string;
  cents: number | null;
  onSave: (nextCents: number | null) => Promise<void>;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit() {
    if (disabled || saving) return;
    setDraft(cents == null ? "" : (cents / 100).toFixed(2));
    setEditing(true);
  }

  async function commit() {
    const trimmed = draft.trim();
    let nextCents: number | null;
    if (trimmed === "") {
      nextCents = null;
    } else {
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num < 0) {
        setEditing(false);
        return;
      }
      nextCents = Math.round(num * 100);
    }
    if (nextCents === cents) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(nextCents);
    } catch {
      // Surface failure by re-entering edit mode would lose the value; just exit.
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="tabular-nums">
        {editing ? (
          <input
            autoFocus
            type="number"
            step="0.01"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            className="w-20 border border-[#343941] bg-[#0F1317] px-2 py-0.5 text-right text-xs text-[#E6E8EB] focus:border-[#20B26B] focus:outline-none"
            disabled={saving}
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            disabled={disabled}
            className={`text-[#E6E8EB] ${disabled ? "" : "cursor-pointer hover:text-[#20B26B]"}`}
            title={disabled ? undefined : "Click to edit"}
          >
            {fmtCents(cents)}
          </button>
        )}
      </dd>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  primary = false,
  accent = false,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  accent?: boolean;
  tone?: "danger";
}) {
  let className =
    "inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium transition-colors ";
  if (accent) {
    className += "border border-[#20B26B] bg-[#20B26B] font-semibold text-[#07100B] hover:bg-[#33C47C]";
  } else if (primary) {
    className += "border border-[#1F5F45] bg-[#0E251B] font-semibold text-[#20B26B] hover:bg-[#143624]";
  } else if (tone === "danger") {
    className += "border border-[#5C2228] bg-[#2A1111] text-[#E05C5C] hover:bg-[#3A1717]";
  } else {
    className += "border border-[#343941] bg-[#0F1317] text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]";
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

const STATUS_OPTIONS = ["unlisted", "listed", "pending_sale", "sold", "returned", "traded"];
const CHANNEL_OPTIONS = ["ebay", "whatnot", "instagram", "show", "local", "other", "veriswap"];
const ACQ_OPTIONS = ["buy", "trade", "rip", "consignment", "other"];
const CONDITION_OPTIONS = ["raw", "graded"];

function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function inputToCents(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Inline editor rendered inside the card profile drawer (business mode).
 * Replaces the legacy blue BusinessInventoryItemEditor — same dark theme as the
 * profile, PATCHes /api/business/inventory and hands the updated row back up.
 */
function InventoryEditForm({
  item,
  onCancel,
  onSaved,
}: {
  item: ProfileLikeItem;
  onCancel: () => void;
  onSaved: (updated: BusinessInventoryItem) => void;
}) {
  const [form, setForm] = useState({
    title: item.title ?? "",
    quantity: String(item.quantity ?? 1),
    status: item.status ?? "unlisted",
    channel: item.channel ?? "other",
    acquisition_type: item.acquisition_type ?? "buy",
    condition_status: item.condition_status ?? (item.grade ? "graded" : "raw"),
    acquisition_date: item.acquisition_date ? item.acquisition_date.slice(0, 10) : "",
    location: item.location ?? "",
    grading_company: item.grading_company ?? "",
    grade: item.grade != null ? String(item.grade) : "",
    cert_number: item.cert_number ?? item.psa_cert_number ?? "",
    notes: item.notes ?? "",
    cost_basis: centsToInput(item.cost_basis_total_cents),
    tax: centsToInput(item.tax_cents),
    shipping: centsToInput(item.shipping_cents),
    fees_paid: centsToInput(item.fees_paid_cents),
    list_price: centsToInput(item.list_price_cents),
    market_value: centsToInput(item.current_market_value_cents),
  });
  const [images, setImages] = useState<string[]>(() =>
    [item.user_image_url, item.image_url].filter(
      (u): u is string => typeof u === "string" && u.startsWith("http")
    )
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxPhotos = form.condition_status === "graded" ? 3 : 10;

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const primaryImage = images[0] ?? null;
      const updates: Record<string, unknown> = {
        id: item.id,
        title: form.title,
        quantity: Math.max(1, Math.round(Number(form.quantity) || 1)),
        status: form.status,
        channel: form.channel,
        acquisition_type: form.acquisition_type,
        condition_status: form.condition_status,
        acquisition_date: form.acquisition_date || null,
        location: form.location || null,
        grading_company: form.grading_company || null,
        grade: form.grade || null,
        cert_number: form.cert_number || null,
        notes: form.notes || null,
        user_image_url: primaryImage,
        image_url: primaryImage,
        image_source: primaryImage ? "user" : "none",
        cost_basis_total_cents: inputToCents(form.cost_basis),
        tax_cents: inputToCents(form.tax),
        shipping_cents: inputToCents(form.shipping),
        fees_paid_cents: inputToCents(form.fees_paid),
        list_price_cents: form.list_price.trim() === "" ? null : inputToCents(form.list_price),
        current_market_value_cents:
          form.market_value.trim() === "" ? null : inputToCents(form.market_value),
      };
      const res = await fetch("/api/business/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to save");
      onSaved(data as BusinessInventoryItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {error ? (
          <div className="mb-4 border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">
            {error}
          </div>
        ) : null}

        {/* Photos */}
        <div className="mb-4">
          <CardPhotoUploader
            images={images}
            onChange={setImages}
            max={maxPhotos}
            onUploadingChange={setUploading}
            onError={setError}
          />
        </div>

        <EditField label="Title" full>
          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className={INPUT_CLASS}
          />
        </EditField>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <EditField label="Quantity">
            <input
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => set("quantity", e.target.value)}
              className={INPUT_CLASS}
            />
          </EditField>
          <EditSelect label="Status" value={form.status} options={STATUS_OPTIONS} onChange={(v) => set("status", v)} />
          <EditField label="Cost Basis ($)">
            <input type="number" step="0.01" value={form.cost_basis} onChange={(e) => set("cost_basis", e.target.value)} className={INPUT_CLASS} />
          </EditField>
          <EditField label="Tax ($)">
            <input type="number" step="0.01" value={form.tax} onChange={(e) => set("tax", e.target.value)} className={INPUT_CLASS} />
          </EditField>

          <EditSelect label="Channel" value={form.channel} options={CHANNEL_OPTIONS} onChange={(v) => set("channel", v)} />
          <EditSelect label="Acquisition" value={form.acquisition_type} options={ACQ_OPTIONS} onChange={(v) => set("acquisition_type", v)} />
          <EditField label="Shipping ($)">
            <input type="number" step="0.01" value={form.shipping} onChange={(e) => set("shipping", e.target.value)} className={INPUT_CLASS} />
          </EditField>
          <EditField label="Fees Paid ($)">
            <input type="number" step="0.01" value={form.fees_paid} onChange={(e) => set("fees_paid", e.target.value)} className={INPUT_CLASS} />
          </EditField>

          <EditField label="Acquisition Date">
            <input type="date" value={form.acquisition_date} onChange={(e) => set("acquisition_date", e.target.value)} className={INPUT_CLASS} />
          </EditField>
          <EditField label="Storage / Location">
            <input value={form.location} onChange={(e) => set("location", e.target.value)} className={INPUT_CLASS} />
          </EditField>
          <EditSelect label="Condition" value={form.condition_status} options={CONDITION_OPTIONS} onChange={(v) => set("condition_status", v)} />
          <EditField label="Grading Co.">
            <input value={form.grading_company} onChange={(e) => set("grading_company", e.target.value)} className={INPUT_CLASS} />
          </EditField>

          <EditField label="Grade">
            <input value={form.grade} onChange={(e) => set("grade", e.target.value)} className={INPUT_CLASS} />
          </EditField>
          <EditField label="Cert #">
            <input value={form.cert_number} onChange={(e) => set("cert_number", e.target.value)} className={INPUT_CLASS} />
          </EditField>
          <EditField label="List Price ($)">
            <input type="number" step="0.01" value={form.list_price} onChange={(e) => set("list_price", e.target.value)} className={INPUT_CLASS} />
          </EditField>
          <EditField label="Est. Market Value ($)">
            <input type="number" step="0.01" value={form.market_value} onChange={(e) => set("market_value", e.target.value)} className={INPUT_CLASS} />
          </EditField>
        </div>

        <EditField label="Notes" full className="mt-3">
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            className={`${INPUT_CLASS} resize-none`}
          />
        </EditField>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[#24282D] px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="border border-[#343941] px-4 py-2 text-xs font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || uploading}
          className="border border-[#20B26B] bg-[#20B26B] px-4 py-2 text-xs font-semibold text-[#07100B] transition-colors hover:bg-[#33C47C] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

const INPUT_CLASS =
  "w-full border border-[#343941] bg-[#0F1317] px-2.5 py-1.5 text-sm text-[#E6E8EB] focus:border-[#20B26B] focus:outline-none";

function EditField({
  label,
  children,
  full = false,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${full ? "col-span-full" : ""} ${className}`}>
      <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
        {label}
      </span>
      {children}
    </label>
  );
}

function EditSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <EditField label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </EditField>
  );
}
