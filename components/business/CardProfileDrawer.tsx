"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CardImage } from "@/components/CardImage";
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
  list_price_cents?: number | null;
  estimated_cmv?: number | null;
  est_cmv?: number | null;
  last_known_price_cents?: number | null;
  quantity?: number | null;
  channel?: string | null;
  status?: string | null;
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
  onEdit?: (item: BusinessInventoryItem) => void;
  onMarkSold?: (item: BusinessInventoryItem) => void;
  onList?: (item: BusinessInventoryItem) => void;
  onDelete?: (item: BusinessInventoryItem) => void;
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

function fmtDollars(value: number | null | undefined): string {
  if (value == null) return "—";
  return MONEY.format(value);
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
  onEdit,
  onMarkSold,
  onList,
  onDelete,
}: Props) {
  const initialNarrowed = (initialItem ?? null) as ProfileLikeItem | null;
  const [item, setItem] = useState<ProfileLikeItem | null>(initialNarrowed);
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Card profile"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111827] text-[#E6E8EB] shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-500">
              Card profile
            </div>
            <h2 className="mt-0.5 truncate text-lg font-bold text-white">
              {item?.player_name ?? (loading ? "Loading…" : "Card")}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {item ? (
              <Link
                href={`/card/${item.id}?from=${mode}`}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                title="Open full profile in a new tab"
                target="_blank"
                rel="noopener noreferrer"
              >
                Full ↗
              </Link>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="m-4 rounded-lg border border-red-800 bg-red-900/30 p-3 text-xs text-red-300">
              {error}
            </div>
          ) : null}

          {item ? (
            <>
              {/* Hero: image + summary */}
              <section className="flex gap-4 border-b border-gray-800 p-6">
                <div className="h-48 w-36 flex-shrink-0 overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
                  <CardImage
                    image={image}
                    alt={item.player_name ?? "Card"}
                    className="h-full w-full"
                    imageClassName="h-full w-full object-cover"
                    fallbackClassName="h-full w-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">
                    {gradeLabel(item)}
                    {item.cert_number || item.psa_cert_number ? (
                      <span className="ml-2 text-gray-600">
                        Cert {item.cert_number ?? item.psa_cert_number}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-base font-semibold leading-tight text-white">
                    {item.player_name ?? "—"}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">{metaLine(item) || "—"}</div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <Stat label="Cost basis" value={fmtCents(item.cost_basis_total_cents)} />
                    <Stat
                      label="CMV"
                      value={fmtCents(pickEstimatedCents(item))}
                    />
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
                </div>
              </section>

              {/* Actions */}
              <section className="flex flex-wrap gap-2 border-b border-gray-800 px-6 py-4">
                {onEdit ? (
                  <ActionButton onClick={() => onEdit(item as BusinessInventoryItem)} primary>
                    Edit
                  </ActionButton>
                ) : null}
                <Link
                  href={buildCompareListingsUrl(item)}
                  onClick={onClose}
                  className="inline-flex items-center rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-medium text-gray-100 transition hover:bg-gray-800"
                >
                  Compare Listings
                </Link>
                {onMarkSold && item.status !== "sold" ? (
                  <ActionButton onClick={() => onMarkSold(item as BusinessInventoryItem)}>
                    Mark sold
                  </ActionButton>
                ) : null}
                {onList ? (
                  <ActionButton onClick={() => onList(item as BusinessInventoryItem)}>
                    List on eBay
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
              </section>

              {/* Targets & plans */}
              {mode === "business" ? (
                <TargetsSection
                  inventoryItemId={item.id}
                  cmvCents={pickEstimatedCents(item)}
                  listPriceCents={item.list_price_cents ?? null}
                />
              ) : null}

              {/* Comps across platforms */}
              {marketplaceLinks.length > 0 ? (
                <section className="border-b border-gray-800 px-6 py-4">
                  <div className="flex items-baseline justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      Comps across platforms
                    </div>
                    <div className="text-[10px] text-gray-600">Opens in new tab</div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {marketplaceLinks.map((link) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 transition-colors hover:border-gray-700 hover:bg-gray-800"
                        style={{ borderLeft: `2px solid ${link.accentColor}` }}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-white">
                            {link.name}
                          </div>
                          <div className="truncate text-[10px] text-gray-500">
                            {link.tagline}
                          </div>
                        </div>
                        <span
                          className="shrink-0 rounded border border-gray-700 px-1.5 py-0.5 text-[8px] font-semibold tracking-wide text-gray-500 group-hover:text-gray-300"
                        >
                          {MARKETPLACE_TYPE_LABELS[link.type]}
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Notes */}
              {item.notes ? (
                <section className="border-b border-gray-800 px-6 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Notes
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-gray-400">
                    {item.notes}
                  </p>
                </section>
              ) : null}

              {/* Sales */}
              {sales.length > 0 ? (
                <section className="border-b border-gray-800 px-6 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Recent sales ({sales.length})
                  </div>
                  <ul className="mt-2 divide-y divide-gray-800">
                    {sales.slice(0, 5).map((sale, idx) => (
                      <li
                        key={sale.id ?? idx}
                        className="flex items-center justify-between py-2 text-xs"
                      >
                        <div className="text-gray-400">
                          {fmtDate(sale.sold_at ?? sale.sale_date)}
                          {sale.channel ? (
                            <span className="ml-2 text-gray-500">· {sale.channel}</span>
                          ) : null}
                        </div>
                        <div className="text-right tabular-nums">
                          <div className="text-white">
                            {fmtCents(sale.sold_price_cents ?? sale.sale_price_cents)}
                          </div>
                          {sale.profit_cents != null ? (
                            <div
                              className={
                                sale.profit_cents > 0
                                  ? "text-emerald-400"
                                  : sale.profit_cents < 0
                                    ? "text-red-400"
                                    : "text-gray-500"
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

              {/* Metadata footer */}
              <section className="px-6 py-4 text-[10px] text-gray-600">
                {item.acquisition_date ? (
                  <div>Acquired {fmtDate(item.acquisition_date)}</div>
                ) : null}
                {item.created_at ? <div>Added {fmtDate(item.created_at)}</div> : null}
                {item.quantity ? <div>Qty {item.quantity}</div> : null}
              </section>
            </>
          ) : loading ? (
            <div className="flex items-center justify-center p-10 text-xs text-gray-500">
              Loading card…
            </div>
          ) : null}
        </div>
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
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-red-400"
        : "text-white";
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
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
            className="w-20 rounded-md border border-gray-700 bg-gray-800 px-2 py-0.5 text-right text-xs text-white focus:border-emerald-500 focus:outline-none"
            disabled={saving}
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            disabled={disabled}
            className={`text-white ${disabled ? "" : "cursor-pointer hover:text-emerald-400"}`}
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
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  tone?: "danger";
}) {
  let className =
    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ";
  if (primary) {
    className += "bg-emerald-600 text-white hover:bg-emerald-700";
  } else if (tone === "danger") {
    className += "border border-red-800 bg-red-900/30 text-red-300 hover:bg-red-900/50";
  } else {
    className += "border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white";
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}
