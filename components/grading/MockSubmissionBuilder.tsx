"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/contexts/AuthContext";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Scope = "personal" | "business";

type OrderStatus =
  | "draft"
  | "submitted"
  | "grading"
  | "returned"
  | "completed"
  | "canceled";

type OrderItem = {
  id: string;
  source_id: string | null;
  title: string;
  year: string | null;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  cost_basis_cents: number;
  estimated_value_cents: number;
};

type OrderData = {
  grading_company: string;
  service_level: string;
  turnaround_days: number | null;
  grading_cost_cents: number;
  shipping_cents: number;
  notes: string;
  items: OrderItem[];
};

type Order = {
  id: string;
  scope: Scope;
  name: string;
  status: OrderStatus;
  data: OrderData;
  created_at: string;
  updated_at?: string;
};

type LedgerCard = {
  id: string;
  title: string;
  year: string | null;
  set_name: string | null;
  card_number: string | null;
  image_url: string | null;
  cost_basis_cents: number;
  market_value_cents: number;
  is_graded: boolean;
};

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const GRADING_COMPANIES = ["PSA", "BGS", "CGC", "SGC", "TAG", "HGA", "Other"];

const STATUS_META: Record<OrderStatus, { label: string; dot: string; text: string }> = {
  draft:     { label: "Draft",     dot: "#77808C", text: "#B8C0CC" },
  submitted: { label: "Submitted", dot: "#6f8fe0", text: "#a9c0f2" },
  grading:   { label: "Grading",   dot: "#d1a44e", text: "#e7c987" },
  returned:  { label: "Returned",  dot: "#4ea3d1", text: "#8fd0ea" },
  completed: { label: "Completed", dot: "#4fbf88", text: "#8fe0b8" },
  canceled:  { label: "Canceled",  dot: "#5A626E", text: "#77808C" },
};

const STATUS_ORDER: OrderStatus[] = [
  "draft",
  "submitted",
  "grading",
  "returned",
  "completed",
  "canceled",
];

function emptyOrderData(company = "PSA"): OrderData {
  return {
    grading_company: company,
    service_level: "",
    turnaround_days: null,
    grading_cost_cents: 0,
    shipping_cents: 0,
    notes: "",
    items: [],
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatMoney(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function centsToInput(cents: number): string {
  if (!Number.isFinite(cents) || cents === 0) return "";
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

function inputToCents(value: string): number {
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function localId(): string {
  return `it_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function coerceData(raw: unknown): OrderData {
  const base = emptyOrderData();
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Record<string, unknown>;
  const items = Array.isArray(d.items)
    ? (d.items as Record<string, unknown>[]).map((it) => ({
        id: typeof it.id === "string" ? it.id : localId(),
        source_id: typeof it.source_id === "string" ? it.source_id : null,
        title: typeof it.title === "string" ? it.title : "Untitled card",
        year: typeof it.year === "string" ? it.year : null,
        set_name: typeof it.set_name === "string" ? it.set_name : null,
        card_number: typeof it.card_number === "string" ? it.card_number : null,
        image_url: typeof it.image_url === "string" ? it.image_url : null,
        cost_basis_cents: Number(it.cost_basis_cents) || 0,
        estimated_value_cents: Number(it.estimated_value_cents) || 0,
      }))
    : [];
  return {
    grading_company:
      typeof d.grading_company === "string" && d.grading_company
        ? d.grading_company
        : "PSA",
    service_level: typeof d.service_level === "string" ? d.service_level : "",
    turnaround_days:
      typeof d.turnaround_days === "number" ? d.turnaround_days : null,
    grading_cost_cents: Number(d.grading_cost_cents) || 0,
    shipping_cents: Number(d.shipping_cents) || 0,
    notes: typeof d.notes === "string" ? d.notes : "",
    items,
  };
}

function pickImage(item: Record<string, any>): string | null {
  const candidates = [
    item.trusted_image?.url,
    item.primary_image?.image_url,
    item.image_url,
    item.user_image_url,
    item.stock_image_url,
    item.ebay_image_url,
    Array.isArray(item.card_images) ? item.card_images[0]?.image_url : null,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//.test(c)) return c;
  }
  return null;
}

function buildTitle(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && String(p).trim())).join(" ");
}

/** Normalize either a personal collection_item or a business inventory item. */
function normalizeLedgerCard(raw: Record<string, any>, scope: Scope): LedgerCard {
  if (scope === "business") {
    const marketCents =
      (typeof raw.current_market_value_cents === "number"
        ? raw.current_market_value_cents
        : null) ??
      (typeof raw.estimated_cmv === "number" ? Math.round(raw.estimated_cmv * 100) : null) ??
      (typeof raw.est_cmv === "number" ? Math.round(raw.est_cmv * 100) : 0);
    const title =
      raw.title ||
      buildTitle([raw.year, raw.player_name, raw.set_name, raw.card_number ? `#${raw.card_number}` : null]) ||
      "Untitled card";
    return {
      id: String(raw.id),
      title,
      year: raw.year ?? null,
      set_name: raw.set_name ?? null,
      card_number: raw.card_number ?? null,
      image_url: pickImage(raw),
      cost_basis_cents: Number(raw.cost_basis_total_cents) || 0,
      market_value_cents: Number(marketCents) || 0,
      is_graded: raw.condition_status === "graded" || Boolean(raw.grade),
    };
  }

  // personal collection item — prices are in dollars
  const dollarsToCents = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.round(v * 100)
      : typeof v === "string" && v.trim() && Number.isFinite(Number(v))
        ? Math.round(Number(v) * 100)
        : 0;
  const marketCents =
    dollarsToCents(raw.estimated_cmv) || dollarsToCents(raw.est_cmv) || 0;
  const title =
    buildTitle([raw.year, raw.player_name, raw.set_name, raw.card_number ? `#${raw.card_number}` : null]) ||
    raw.player_name ||
    "Untitled card";
  return {
    id: String(raw.id),
    title,
    year: raw.year ?? null,
    set_name: raw.set_name ?? null,
    card_number: raw.card_number != null ? String(raw.card_number) : null,
    image_url: pickImage(raw),
    cost_basis_cents: dollarsToCents(raw.purchase_price),
    market_value_cents: marketCents,
    is_graded: Boolean(raw.grade && String(raw.grade).trim()),
  };
}

/* ------------------------------------------------------------------ */
/* Risk / reward                                                       */
/* ------------------------------------------------------------------ */

function computeEconomics(data: OrderData) {
  const itemCount = data.items.length;
  const totalCostBasis = data.items.reduce((s, i) => s + (i.cost_basis_cents || 0), 0);
  const totalGrading = itemCount * (data.grading_cost_cents || 0);
  const shipping = data.shipping_cents || 0;
  const totalInvestment = totalCostBasis + totalGrading + shipping;
  const totalEstValue = data.items.reduce((s, i) => s + (i.estimated_value_cents || 0), 0);
  const projectedProfit = totalEstValue - totalInvestment;
  const roi = totalInvestment > 0 ? projectedProfit / totalInvestment : null;
  const perCardShipping = itemCount > 0 ? shipping / itemCount : 0;
  return {
    itemCount,
    totalCostBasis,
    totalGrading,
    shipping,
    totalInvestment,
    totalEstValue,
    projectedProfit,
    roi,
    perCardShipping,
  };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const INPUT =
  "rounded border border-[#2b3036] bg-[#0B0D0F] px-2.5 py-1.5 text-[13px] text-[#E6E8EB] outline-none focus:border-[#5A626E]";

export default function MockSubmissionBuilder({ scope }: { scope: Scope }) {
  const { authUser, loading: authLoading } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ledger, setLedger] = useState<LedgerCard[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("PSA");
  const [creating, setCreating] = useState(false);

  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [hideGraded, setHideGraded] = useState(true);
  const [pickerSel, setPickerSel] = useState<string[]>([]);

  const [savingId, setSavingId] = useState<string | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  /* ---------- load orders + ledger ---------- */

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const res = await fetch(`/api/grading/mock-orders?scope=${scope}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      const rows: Order[] = Array.isArray(json?.orders)
        ? json.orders.map((r: Record<string, unknown>) => ({
            id: String(r.id),
            scope: (r.scope as Scope) ?? scope,
            name: String(r.name ?? "Untitled order"),
            status: (r.status as OrderStatus) ?? "draft",
            data: coerceData(r.data),
            created_at: String(r.created_at ?? ""),
            updated_at: r.updated_at ? String(r.updated_at) : undefined,
          }))
        : [];
      setOrders(rows);
      setSelectedId((prev) => (prev && rows.some((o) => o.id === prev) ? prev : rows[0]?.id ?? ""));
    } catch {
      setError("Couldn't load your grading orders.");
    } finally {
      setLoadingOrders(false);
    }
  }, [scope]);

  const loadLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const endpoint = scope === "business" ? "/api/business/inventory" : "/api/collection";
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const raw: Record<string, any>[] = Array.isArray(json?.items) ? json.items : [];
      setLedger(raw.map((r) => normalizeLedgerCard(r, scope)));
    } catch {
      // ledger is optional; manual/empty is fine
      setLedger([]);
    } finally {
      setLoadingLedger(false);
    }
  }, [scope]);

  useEffect(() => {
    if (authLoading || !authUser) return;
    void loadOrders();
    void loadLedger();
  }, [authLoading, authUser, loadOrders, loadLedger]);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? null,
    [orders, selectedId]
  );

  /* ---------- persistence ---------- */

  const persist = useCallback(async (order: Order) => {
    setSavingId(order.id);
    try {
      await fetch("/api/grading/mock-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: order.id,
          name: order.name,
          status: order.status,
          data: order.data,
        }),
      });
    } catch {
      setError("Couldn't save changes. Check your connection.");
    } finally {
      setSavingId((cur) => (cur === order.id ? null : cur));
    }
  }, []);

  const scheduleSave = useCallback(
    (order: Order, delay = 500) => {
      const timers = saveTimers.current;
      if (timers[order.id]) clearTimeout(timers[order.id]);
      timers[order.id] = setTimeout(() => {
        void persist(order);
        delete timers[order.id];
      }, delay);
    },
    [persist]
  );

  /** Apply an update to an order in state and schedule a debounced save. */
  const mutateOrder = useCallback(
    (id: string, updater: (o: Order) => Order, delay = 500) => {
      setOrders((prev) => {
        const next = prev.map((o) => (o.id === id ? updater(o) : o));
        const changed = next.find((o) => o.id === id);
        if (changed) scheduleSave(changed, delay);
        return next;
      });
    },
    [scheduleSave]
  );

  const mutateData = useCallback(
    (id: string, updater: (d: OrderData) => OrderData, delay = 500) => {
      mutateOrder(id, (o) => ({ ...o, data: updater(o.data) }), delay);
    },
    [mutateOrder]
  );

  /* ---------- create / delete ---------- */

  const createOrder = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/grading/mock-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, name, data: emptyOrderData(newCompany) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.order) throw new Error(json?.error || "Failed to create order");
      const created: Order = {
        id: String(json.order.id),
        scope,
        name,
        status: (json.order.status as OrderStatus) ?? "draft",
        data: coerceData(json.order.data),
        created_at: String(json.order.created_at ?? new Date().toISOString()),
      };
      setOrders((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setNewName("");
      setNewCompany("PSA");
      setShowCreate(false);
      setShowPicker(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create order");
    } finally {
      setCreating(false);
    }
  }, [newName, newCompany, scope]);

  const deleteOrder = useCallback(
    async (id: string) => {
      if (!confirm("Delete this grading order? This can't be undone.")) return;
      setOrders((prev) => prev.filter((o) => o.id !== id));
      setSelectedId((cur) => (cur === id ? "" : cur));
      await fetch(`/api/grading/mock-orders?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => {});
    },
    []
  );

  /* ---------- card items ---------- */

  const addCardsFromLedger = useCallback(() => {
    if (!selected || pickerSel.length === 0) return;
    const existingSources = new Set(
      selected.data.items.map((i) => i.source_id).filter(Boolean) as string[]
    );
    const toAdd = ledger
      .filter((c) => pickerSel.includes(c.id) && !existingSources.has(c.id))
      .map<OrderItem>((c) => ({
        id: localId(),
        source_id: c.id,
        title: c.title,
        year: c.year,
        set_name: c.set_name,
        card_number: c.card_number,
        image_url: c.image_url,
        cost_basis_cents: c.cost_basis_cents,
        // seed the estimated graded value from current market value; user refines
        estimated_value_cents: c.market_value_cents || c.cost_basis_cents,
      }));
    if (toAdd.length === 0) {
      setPickerSel([]);
      return;
    }
    mutateData(selected.id, (d) => ({ ...d, items: [...d.items, ...toAdd] }), 0);
    setPickerSel([]);
    setPickerSearch("");
  }, [selected, pickerSel, ledger, mutateData]);

  const addManualCard = useCallback(() => {
    if (!selected) return;
    mutateData(
      selected.id,
      (d) => ({
        ...d,
        items: [
          ...d.items,
          {
            id: localId(),
            source_id: null,
            title: "New card",
            year: null,
            set_name: null,
            card_number: null,
            image_url: null,
            cost_basis_cents: 0,
            estimated_value_cents: 0,
          },
        ],
      }),
      0
    );
  }, [selected, mutateData]);

  const updateItem = useCallback(
    (itemId: string, patch: Partial<OrderItem>, delay = 500) => {
      if (!selected) return;
      mutateData(
        selected.id,
        (d) => ({
          ...d,
          items: d.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
        }),
        delay
      );
    },
    [selected, mutateData]
  );

  const removeItem = useCallback(
    (itemId: string) => {
      if (!selected) return;
      mutateData(selected.id, (d) => ({ ...d, items: d.items.filter((i) => i.id !== itemId) }), 0);
    },
    [selected, mutateData]
  );

  /* ---------- derived ---------- */

  const econ = useMemo(
    () => (selected ? computeEconomics(selected.data) : null),
    [selected]
  );

  const filteredLedger = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return ledger.filter((c) => {
      if (hideGraded && c.is_graded) return false;
      if (!q) return true;
      return c.title.toLowerCase().includes(q);
    });
  }, [ledger, pickerSearch, hideGraded]);

  /* ---------- render ---------- */

  if (authLoading) {
    return <div className="p-8 text-[13px] text-[#77808C]">Loading…</div>;
  }
  if (!authUser) {
    return (
      <div className="p-8 text-[13px] text-[#B8C0CC]">
        Please sign in to plan grading submissions.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-6 md:px-10">
      {error && (
        <div className="mb-4 rounded border border-[#5a2b2b] bg-[#1a0f0f] px-3 py-2 text-[12px] text-[#f0b4b4]">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 text-[#f0b4b4]/70 underline underline-offset-2 hover:text-[#f0b4b4]"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ───────── Orders rail ───────── */}
        <aside className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#77808C]">
              Orders
            </h2>
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="border border-[#E6E8EB] bg-[#E6E8EB] px-2.5 py-1 text-[11px] font-semibold text-[#0B0D0F] transition-colors hover:bg-white"
            >
              {showCreate ? "Close" : "+ New"}
            </button>
          </div>

          {showCreate && (
            <div className="space-y-2 border border-[#24282D] bg-[#0F1317] p-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void createOrder()}
                placeholder="Order name (e.g. July PSA batch)"
                className={`${INPUT} w-full`}
              />
              <select
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                className={`${INPUT} w-full`}
              >
                {GRADING_COMPANIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                disabled={creating || !newName.trim()}
                onClick={() => void createOrder()}
                className="w-full border border-[#5A626E] bg-[#13171B] px-3 py-1.5 text-[12px] font-medium text-[#E6E8EB] transition-colors hover:border-[#788393] disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create order"}
              </button>
            </div>
          )}

          {loadingOrders ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded bg-[#13171B]" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <p className="border border-dashed border-[#24282D] px-3 py-6 text-center text-[12px] text-[#77808C]">
              No orders yet. Create one to start planning a submission.
            </p>
          ) : (
            <div className="space-y-2">
              {orders.map((o) => {
                const e = computeEconomics(o.data);
                const meta = STATUS_META[o.status];
                const active = o.id === selectedId;
                return (
                  <button
                    key={o.id}
                    onClick={() => {
                      setSelectedId(o.id);
                      setShowPicker(false);
                    }}
                    className={`w-full border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? "border-[#5A626E] bg-[#13171B]"
                        : "border-[#24282D] bg-[#0F1317] hover:border-[#3a4048]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-[#E6E8EB]">
                        {o.name}
                      </span>
                      <span
                        className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium"
                        style={{ color: meta.text }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: meta.dot }}
                        />
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[#77808C]">
                      <span>
                        {o.data.grading_company} · {e.itemCount} card
                        {e.itemCount !== 1 ? "s" : ""}
                      </span>
                      {e.itemCount > 0 && (
                        <span
                          style={{
                            color: e.projectedProfit >= 0 ? "#8fe0b8" : "#f0b4b4",
                          }}
                        >
                          {e.projectedProfit >= 0 ? "+" : ""}
                          {formatMoney(e.projectedProfit)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* ───────── Detail ───────── */}
        <section className="min-w-0">
          {!selected ? (
            <div className="flex h-full min-h-[260px] items-center justify-center border border-dashed border-[#24282D] text-[13px] text-[#77808C]">
              {orders.length === 0
                ? "Create an order to begin."
                : "Select an order to view its details."}
            </div>
          ) : (
            <div className="space-y-5">
              {/* title row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  value={selected.name}
                  onChange={(e) =>
                    mutateOrder(selected.id, (o) => ({ ...o, name: e.target.value }), 800)
                  }
                  className="min-w-0 flex-1 border-none bg-transparent text-[20px] font-semibold text-[#E6E8EB] outline-none"
                />
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-[#5A626E]">
                    {savingId === selected.id ? "Saving…" : "Saved"}
                  </span>
                  <button
                    onClick={() => void deleteOrder(selected.id)}
                    className="text-[11px] text-[#77808C] underline underline-offset-2 hover:text-[#f0b4b4]"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* settings */}
              <div className="grid gap-3 border border-[#24282D] bg-[#0F1317] p-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Grading company">
                  <select
                    value={selected.data.grading_company}
                    onChange={(e) =>
                      mutateData(selected.id, (d) => ({ ...d, grading_company: e.target.value }), 0)
                    }
                    className={`${INPUT} w-full`}
                  >
                    {GRADING_COMPANIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Service level">
                  <input
                    value={selected.data.service_level}
                    onChange={(e) =>
                      mutateData(selected.id, (d) => ({ ...d, service_level: e.target.value }), 800)
                    }
                    placeholder="e.g. Value, Regular, Express"
                    className={`${INPUT} w-full`}
                  />
                </Field>
                <Field label="Est. turnaround (days)">
                  <input
                    inputMode="numeric"
                    value={selected.data.turnaround_days ?? ""}
                    onChange={(e) => {
                      const n = e.target.value.replace(/[^\d]/g, "");
                      mutateData(
                        selected.id,
                        (d) => ({ ...d, turnaround_days: n ? Number(n) : null }),
                        800
                      );
                    }}
                    placeholder="e.g. 45"
                    className={`${INPUT} w-full`}
                  />
                </Field>
                <Field label="Grading cost / card">
                  <MoneyInput
                    cents={selected.data.grading_cost_cents}
                    onChange={(cents) =>
                      mutateData(selected.id, (d) => ({ ...d, grading_cost_cents: cents }), 700)
                    }
                  />
                </Field>
                <Field label="Shipping + insurance">
                  <MoneyInput
                    cents={selected.data.shipping_cents}
                    onChange={(cents) =>
                      mutateData(selected.id, (d) => ({ ...d, shipping_cents: cents }), 700)
                    }
                  />
                </Field>
                <Field label="Order status">
                  <select
                    value={selected.status}
                    onChange={(e) =>
                      mutateOrder(
                        selected.id,
                        (o) => ({ ...o, status: e.target.value as OrderStatus }),
                        0
                      )
                    }
                    className={`${INPUT} w-full`}
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* risk / reward */}
              {econ && (
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-[#24282D] bg-[#24282D] sm:grid-cols-4">
                  <Stat label="Total investment" value={formatMoney(econ.totalInvestment)} sub={`${econ.itemCount} cards · fees ${formatMoney(econ.totalGrading + econ.shipping)}`} />
                  <Stat label="Est. graded value" value={formatMoney(econ.totalEstValue)} />
                  <Stat
                    label="Projected profit"
                    value={`${econ.projectedProfit >= 0 ? "+" : ""}${formatMoney(econ.projectedProfit)}`}
                    color={econ.projectedProfit >= 0 ? "#8fe0b8" : "#f0b4b4"}
                  />
                  <Stat
                    label="Return on cost"
                    value={econ.roi == null ? "—" : `${(econ.roi * 100).toFixed(0)}%`}
                    color={
                      econ.roi == null ? undefined : econ.roi >= 0 ? "#8fe0b8" : "#f0b4b4"
                    }
                  />
                </div>
              )}

              {/* cards */}
              <div className="border border-[#24282D] bg-[#0F1317]">
                <div className="flex items-center justify-between border-b border-[#24282D] px-4 py-2.5">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#B8C0CC]">
                    Cards
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowPicker((v) => !v)}
                      className="border border-[#343941] px-2.5 py-1 text-[11px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
                    >
                      {showPicker ? "Close picker" : "Add from ledger"}
                    </button>
                    <button
                      onClick={addManualCard}
                      className="border border-[#343941] px-2.5 py-1 text-[11px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
                    >
                      + Blank row
                    </button>
                  </div>
                </div>

                {/* ledger picker */}
                {showPicker && (
                  <div className="border-b border-[#24282D] bg-[#0B0D0F] p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <input
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        placeholder="Search your ledger…"
                        className={`${INPUT} flex-1`}
                      />
                      <label className="flex items-center gap-1.5 text-[11px] text-[#77808C]">
                        <input
                          type="checkbox"
                          checked={hideGraded}
                          onChange={(e) => setHideGraded(e.target.checked)}
                        />
                        Hide already graded
                      </label>
                      <button
                        disabled={pickerSel.length === 0}
                        onClick={addCardsFromLedger}
                        className="border border-[#5A626E] bg-[#13171B] px-3 py-1.5 text-[11px] font-medium text-[#E6E8EB] transition-colors hover:border-[#788393] disabled:opacity-50"
                      >
                        Add {pickerSel.length > 0 ? `${pickerSel.length} ` : ""}selected
                      </button>
                    </div>
                    <div className="max-h-56 overflow-auto rounded border border-[#24282D]">
                      {loadingLedger ? (
                        <p className="p-3 text-[12px] text-[#77808C]">Loading ledger…</p>
                      ) : filteredLedger.length === 0 ? (
                        <p className="p-3 text-[12px] text-[#77808C]">
                          {ledger.length === 0
                            ? "No cards in your ledger yet."
                            : "No cards match. Try clearing the search or the graded filter."}
                        </p>
                      ) : (
                        filteredLedger.map((c) => {
                          const checked = pickerSel.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className={`flex cursor-pointer items-center gap-3 border-b border-[#1a1e22] px-3 py-2 text-[12px] last:border-b-0 ${
                                checked ? "bg-[#13171B]" : "hover:bg-[#101418]"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setPickerSel((prev) =>
                                    e.target.checked
                                      ? [...prev, c.id]
                                      : prev.filter((x) => x !== c.id)
                                  )
                                }
                              />
                              <CardThumb url={c.image_url} />
                              <span className="min-w-0 flex-1 truncate text-[#E6E8EB]">
                                {c.title}
                                {c.is_graded && (
                                  <span className="ml-1.5 text-[10px] text-[#d1a44e]">graded</span>
                                )}
                              </span>
                              <span className="shrink-0 text-[11px] text-[#77808C]">
                                cost {formatMoney(c.cost_basis_cents)}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* items table */}
                {selected.data.items.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[12px] text-[#77808C]">
                    No cards yet. Add cards from your ledger, or a blank row for a card you
                    don&apos;t track.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-[#24282D] text-left text-[10px] uppercase tracking-[0.1em] text-[#77808C]">
                          <th className="px-4 py-2 font-medium">Card</th>
                          <th className="px-3 py-2 font-medium">Cost basis</th>
                          <th className="px-3 py-2 font-medium">Est. graded value</th>
                          <th className="px-3 py-2 font-medium">Net / card</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {selected.data.items.map((item) => {
                          const net =
                            item.estimated_value_cents -
                            item.cost_basis_cents -
                            selected.data.grading_cost_cents -
                            (econ?.perCardShipping ?? 0);
                          return (
                            <tr key={item.id} className="border-b border-[#1a1e22] align-middle">
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2.5">
                                  <CardThumb url={item.image_url} />
                                  {item.source_id ? (
                                    <span className="min-w-0 truncate text-[#E6E8EB]">
                                      {item.title}
                                    </span>
                                  ) : (
                                    <input
                                      value={item.title}
                                      onChange={(e) =>
                                        updateItem(item.id, { title: e.target.value }, 800)
                                      }
                                      className={`${INPUT} w-full min-w-[160px]`}
                                    />
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <MoneyInput
                                  cents={item.cost_basis_cents}
                                  onChange={(cents) =>
                                    updateItem(item.id, { cost_basis_cents: cents }, 700)
                                  }
                                  width="w-24"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <MoneyInput
                                  cents={item.estimated_value_cents}
                                  onChange={(cents) =>
                                    updateItem(item.id, { estimated_value_cents: cents }, 700)
                                  }
                                  width="w-24"
                                />
                              </td>
                              <td
                                className="px-3 py-2 font-medium tabular-nums"
                                style={{ color: net >= 0 ? "#8fe0b8" : "#f0b4b4" }}
                              >
                                {net >= 0 ? "+" : ""}
                                {formatMoney(net)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => removeItem(item.id)}
                                  className="text-[#5A626E] transition-colors hover:text-[#f0b4b4]"
                                  title="Remove"
                                >
                                  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-[#5A626E]">
                Planning tool only — figures are your own estimates, not a predicted grade.
                &ldquo;Est. graded value&rdquo; is what you expect the card to be worth once it
                comes back at your target grade.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#77808C]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-[#0F1317] px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#77808C]">{label}</p>
      <p className="mt-1 text-[17px] font-semibold tabular-nums" style={{ color: color ?? "#E6E8EB" }}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-[#5A626E]">{sub}</p>}
    </div>
  );
}

function CardThumb({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span className="flex h-9 w-7 shrink-0 items-center justify-center rounded-sm border border-[#24282D] bg-[#0B0D0F] text-[#3a4048]">
        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
        </svg>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-9 w-7 shrink-0 rounded-sm border border-[#24282D] object-cover"
      loading="lazy"
    />
  );
}

function MoneyInput({
  cents,
  onChange,
  width = "w-full",
}: {
  cents: number;
  onChange: (cents: number) => void;
  width?: string;
}) {
  const [text, setText] = useState(() => centsToInput(cents));
  const focused = useRef(false);

  // keep in sync when the underlying value changes and the field isn't being edited
  useEffect(() => {
    if (!focused.current) setText(centsToInput(cents));
  }, [cents]);

  return (
    <div className={`relative ${width}`}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[#5A626E]">
        $
      </span>
      <input
        inputMode="decimal"
        value={text}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText(centsToInput(cents));
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.]/g, "");
          setText(raw);
          onChange(inputToCents(raw));
        }}
        placeholder="0"
        className={`w-full rounded border border-[#2b3036] bg-[#0B0D0F] py-1.5 pl-5 pr-2.5 text-[13px] tabular-nums text-[#E6E8EB] outline-none focus:border-[#5A626E]`}
      />
    </div>
  );
}
