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

  if (!isOpen) return null;

  const image: TrustedCardImage | null | undefined =
    (item?.trusted_image as TrustedCardImage | null | undefined) ??
    (item?.user_image_url
      ? ({ kind: "user_upload", url: item.user_image_url } as unknown as TrustedCardImage)
      : item?.image_url
        ? ({ kind: "external", url: item.image_url } as unknown as TrustedCardImage)
        : null);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Card profile"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-[#24282D] bg-[#0F1317] text-[#E6E8EB] shadow-2xl"
      >
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#24282D] bg-[#0B0D0F]/95 px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
              Card profile
            </div>
            <h2 className="mt-0.5 truncate text-sm font-semibold text-[#E6E8EB]">
              {item?.player_name ?? (loading ? "Loading…" : "Card")}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {item ? (
              <Link
                href={`/card/${item.id}?from=${mode}`}
                className="border border-[#343941] px-2 py-1 text-[11px] font-medium text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
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
              className="rounded-md p-1 text-[#77808C] hover:bg-[#1E2227] hover:text-[#E6E8EB]"
              aria-label="Close"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="m-3 rounded-md border border-red-800/50 bg-red-950/40 p-3 text-xs text-red-200">
              {error}
            </div>
          ) : null}

          {item ? (
            <>
              {/* Hero: image + summary */}
              <section className="flex gap-3 border-b border-[#24282D] p-4">
                <div className="h-44 w-32 flex-shrink-0 overflow-hidden border border-[#24282D] bg-[#0B0D0F]">
                  <CardImage
                    image={image}
                    alt={item.player_name ?? "Card"}
                    className="h-full w-full"
                    imageClassName="h-full w-full object-cover"
                    fallbackClassName="h-full w-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-wide text-[#77808C]">
                    {gradeLabel(item)}
                    {item.cert_number || item.psa_cert_number ? (
                      <span className="ml-2 text-[#5A626E]">
                        Cert {item.cert_number ?? item.psa_cert_number}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[15px] font-semibold leading-tight text-[#E6E8EB]">
                    {item.player_name ?? "—"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#B8C0CC]">{metaLine(item) || "—"}</div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
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
              <section className="flex flex-wrap gap-1.5 border-b border-[#24282D] px-4 py-3">
                {onEdit ? (
                  <ActionButton onClick={() => onEdit(item as BusinessInventoryItem)} primary>
                    Edit
                  </ActionButton>
                ) : null}
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
                <section className="border-b border-[#24282D] px-4 py-3">
                  <div className="flex items-baseline justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77808C]">
                      Comps across platforms
                    </div>
                    <div className="text-[10px] text-[#5A626E]">Opens in new tab</div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {marketplaceLinks.map((link) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between gap-2 border border-[#24282D] bg-[#0B0D0F] px-2.5 py-1.5 hover:border-[#5A626E] hover:bg-[#13171B]"
                        style={{ borderLeft: `2px solid ${link.accentColor}` }}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-[#E6E8EB]">
                            {link.name}
                          </div>
                          <div className="truncate text-[10px] text-[#77808C]">
                            {link.tagline}
                          </div>
                        </div>
                        <span
                          className="shrink-0 border border-[#24282D] px-1 py-[1px] text-[8px] font-semibold tracking-wide text-[#77808C] group-hover:text-[#B8C0CC]"
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
                <section className="border-b border-[#24282D] px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77808C]">
                    Notes
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[12px] text-[#B8C0CC]">
                    {item.notes}
                  </p>
                </section>
              ) : null}

              {/* Sales */}
              {sales.length > 0 ? (
                <section className="border-b border-[#24282D] px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77808C]">
                    Recent sales ({sales.length})
                  </div>
                  <ul className="mt-2 divide-y divide-[#24282D]">
                    {sales.slice(0, 5).map((sale, idx) => (
                      <li
                        key={sale.id ?? idx}
                        className="flex items-center justify-between py-1.5 text-[11px]"
                      >
                        <div className="text-[#B8C0CC]">
                          {fmtDate(sale.sold_at ?? sale.sale_date)}
                          {sale.channel ? (
                            <span className="ml-2 text-[#77808C]">· {sale.channel}</span>
                          ) : null}
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
                                    : "text-[#77808C]"
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
              <section className="px-4 py-3 text-[10px] text-[#5A626E]">
                {item.acquisition_date ? (
                  <div>Acquired {fmtDate(item.acquisition_date)}</div>
                ) : null}
                {item.created_at ? <div>Added {fmtDate(item.created_at)}</div> : null}
                {item.quantity ? <div>Qty {item.quantity}</div> : null}
              </section>
            </>
          ) : loading ? (
            <div className="flex items-center justify-center p-10 text-[12px] text-[#77808C]">
              Loading card…
            </div>
          ) : null}
        </div>
      </aside>
    </>
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
      <dt className="text-[#77808C]">{label}</dt>
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
            className="w-20 border border-[#343941] bg-[#0B0D0F] px-1 py-0.5 text-right text-[11px] text-[#E6E8EB] focus:border-[#5A626E] focus:outline-none"
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
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  tone?: "danger";
}) {
  let className = "border px-2.5 py-1 text-[11px] font-medium transition-colors ";
  if (primary) {
    className += "border-[#20B26B] bg-[#20B26B] text-[#07100B] hover:bg-[#33C47C]";
  } else if (tone === "danger") {
    className += "border-[#5C2228] bg-[#1A0F11] text-[#E05C5C] hover:bg-[#2A1518]";
  } else {
    className += "border-[#343941] text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]";
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}
