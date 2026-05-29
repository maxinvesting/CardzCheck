"use client";

import { useCallback, useEffect, useState } from "react";

export interface CardTarget {
  id: string;
  inventory_item_id: string;
  kind: "sell_price" | "flip_by" | "hold_until" | "custom";
  description: string;
  target_price_cents: number | null;
  target_date: string | null;
  status: "active" | "achieved" | "abandoned";
  ai_insight: string | null;
  ai_insight_at: string | null;
  achieved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ParsedInsight {
  progress_pct: number | null;
  status: "on_track" | "ahead" | "behind" | "blocked" | "unknown";
  headline: string;
  actions: string[];
  risks: string[];
  summary: string;
}

interface Props {
  inventoryItemId: string;
  cmvCents: number | null;
  listPriceCents: number | null;
}

const KIND_LABELS: Record<CardTarget["kind"], string> = {
  sell_price: "Sell at price",
  flip_by: "Flip by date",
  hold_until: "Hold until",
  custom: "Custom goal",
};

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

function parseInsight(raw: string | null): ParsedInsight | null {
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      progress_pct:
        typeof parsed.progress_pct === "number" ? parsed.progress_pct : null,
      status: parsed.status ?? "unknown",
      headline: typeof parsed.headline === "string" ? parsed.headline : "",
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
  } catch {
    return null;
  }
}

function computeProgress(
  target: CardTarget,
  cmvCents: number | null,
  listPriceCents: number | null
): number | null {
  if (target.kind === "sell_price" && target.target_price_cents) {
    const current = listPriceCents ?? cmvCents;
    if (current == null) return null;
    return Math.max(0, Math.min(100, (current / target.target_price_cents) * 100));
  }
  if (target.kind === "flip_by" && target.target_date) {
    const created = new Date(target.created_at).getTime();
    const due = new Date(target.target_date).getTime();
    const now = Date.now();
    if (!Number.isFinite(due) || due <= created) return null;
    const elapsed = now - created;
    const total = due - created;
    return Math.max(0, Math.min(100, (elapsed / total) * 100));
  }
  return null;
}

const STATUS_TONE: Record<ParsedInsight["status"], string> = {
  on_track: "text-[#20B26B] border-[#1F5F45]",
  ahead: "text-[#20B26B] border-[#1F5F45]",
  behind: "text-[#F0B429] border-[#5A4A1F]",
  blocked: "text-[#E05C5C] border-[#5C2228]",
  unknown: "text-[#77808C] border-[#343941]",
};

export default function TargetsSection({
  inventoryItemId,
  cmvCents,
  listPriceCents,
}: Props) {
  const [targets, setTargets] = useState<CardTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insightLoadingId, setInsightLoadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/business/inventory/${inventoryItemId}/targets`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load targets");
      setTargets(Array.isArray(data.targets) ? data.targets : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load targets");
    } finally {
      setLoading(false);
    }
  }, [inventoryItemId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTarget(payload: {
    kind: CardTarget["kind"];
    description: string;
    target_price_cents: number | null;
    target_date: string | null;
  }) {
    const res = await fetch(
      `/api/business/inventory/${inventoryItemId}/targets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Failed to add target");
    setTargets((prev) => [data.target as CardTarget, ...prev]);
  }

  async function updateStatus(targetId: string, status: CardTarget["status"]) {
    const res = await fetch(
      `/api/business/inventory/${inventoryItemId}/targets/${targetId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Failed to update");
    setTargets((prev) =>
      prev.map((t) => (t.id === targetId ? (data.target as CardTarget) : t))
    );
  }

  async function deleteTarget(targetId: string) {
    if (!window.confirm("Delete this target?")) return;
    const res = await fetch(
      `/api/business/inventory/${inventoryItemId}/targets/${targetId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Failed to delete");
    }
    setTargets((prev) => prev.filter((t) => t.id !== targetId));
  }

  async function refreshInsight(targetId: string) {
    setInsightLoadingId(targetId);
    try {
      const res = await fetch(
        `/api/business/inventory/${inventoryItemId}/targets/${targetId}/insight`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "AI request failed");
      setTargets((prev) =>
        prev.map((t) => (t.id === targetId ? (data.target as CardTarget) : t))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setInsightLoadingId(null);
    }
  }

  return (
    <section className="border-b border-[#24282D] px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77808C]">
          Targets & plans
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="border border-[#343941] px-2 py-0.5 text-[10px] font-medium text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
        >
          {showForm ? "Cancel" : "+ Add target"}
        </button>
      </div>

      {error ? (
        <div className="mt-2 border border-red-800/50 bg-red-950/30 p-2 text-[11px] text-red-200">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <TargetForm
          onSubmit={async (payload) => {
            try {
              await createTarget(payload);
              setShowForm(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed");
            }
          }}
        />
      ) : null}

      {loading ? (
        <div className="mt-2 text-[11px] text-[#77808C]">Loading…</div>
      ) : targets.length === 0 ? (
        <div className="mt-2 text-[11px] text-[#77808C]">
          No targets yet. Set a sell price, a flip-by date, or a custom plan and get AI insights toward it.
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {targets.map((t) => {
            const insight = parseInsight(t.ai_insight);
            const progress = insight?.progress_pct ?? computeProgress(t, cmvCents, listPriceCents);
            const tone = insight ? STATUS_TONE[insight.status] : STATUS_TONE.unknown;
            const isAchieved = t.status === "achieved";
            const isAbandoned = t.status === "abandoned";
            return (
              <li
                key={t.id}
                className={`border border-[#24282D] bg-[#0B0D0F] p-2.5 ${
                  isAchieved ? "opacity-70" : ""
                } ${isAbandoned ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-[#77808C]">
                      {KIND_LABELS[t.kind]}
                      {t.status !== "active" ? (
                        <span className="ml-2 text-[#5A626E]">· {t.status}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[12px] text-[#E6E8EB]">{t.description}</div>
                    <div className="mt-0.5 flex gap-3 text-[10px] text-[#77808C]">
                      {t.target_price_cents != null ? (
                        <span>Target {fmtCents(t.target_price_cents)}</span>
                      ) : null}
                      {t.target_date ? <span>By {fmtDate(t.target_date)}</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {t.status === "active" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void updateStatus(t.id, "achieved")}
                          className="border border-[#1F5F45] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#20B26B] hover:bg-[#0E251B]"
                          title="Mark achieved"
                        >
                          Done
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateStatus(t.id, "abandoned")}
                          className="border border-[#343941] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#77808C] hover:text-[#B8C0CC]"
                          title="Mark abandoned"
                        >
                          Drop
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void updateStatus(t.id, "active")}
                        className="border border-[#343941] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#77808C] hover:text-[#B8C0CC]"
                      >
                        Reopen
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteTarget(t.id)}
                      className="border border-[#5C2228] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#E05C5C] hover:bg-[#2A1518]"
                    >
                      Del
                    </button>
                  </div>
                </div>

                {progress != null ? (
                  <div className="mt-2">
                    <div className="h-1 w-full overflow-hidden bg-[#1E2227]">
                      <div
                        className="h-full bg-[#20B26B]"
                        style={{ width: `${Math.round(progress)}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-[9px] uppercase tracking-wide text-[#5A626E]">
                      {Math.round(progress)}% progress
                    </div>
                  </div>
                ) : null}

                {/* AI insight */}
                <div className="mt-2 border-t border-[#1E2227] pt-2">
                  {insight ? (
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className={`border px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide ${tone}`}>
                          {insight.status.replace("_", " ")}
                        </div>
                        <div className="text-[9px] text-[#5A626E]">
                          {t.ai_insight_at ? `Updated ${fmtDate(t.ai_insight_at)}` : ""}
                        </div>
                      </div>
                      {insight.headline ? (
                        <div className="text-[12px] font-semibold text-[#E6E8EB]">
                          {insight.headline}
                        </div>
                      ) : null}
                      {insight.summary ? (
                        <div className="text-[11px] text-[#B8C0CC]">{insight.summary}</div>
                      ) : null}
                      {insight.actions.length > 0 ? (
                        <div>
                          <div className="text-[9px] font-semibold uppercase tracking-wide text-[#77808C]">
                            Next steps
                          </div>
                          <ul className="mt-0.5 list-disc pl-4 text-[11px] text-[#B8C0CC]">
                            {insight.actions.map((a, i) => (
                              <li key={i}>{a}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {insight.risks.length > 0 ? (
                        <div>
                          <div className="text-[9px] font-semibold uppercase tracking-wide text-[#77808C]">
                            Risks
                          </div>
                          <ul className="mt-0.5 list-disc pl-4 text-[11px] text-[#B8C0CC]">
                            {insight.risks.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : t.ai_insight ? (
                    <div className="text-[11px] text-[#B8C0CC] whitespace-pre-wrap">
                      {t.ai_insight}
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#77808C]">
                      No AI analysis yet.
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void refreshInsight(t.id)}
                    disabled={insightLoadingId === t.id}
                    className="mt-1.5 border border-[#343941] px-2 py-0.5 text-[10px] font-medium text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB] disabled:opacity-50"
                  >
                    {insightLoadingId === t.id
                      ? "Analyzing…"
                      : t.ai_insight
                        ? "Refresh AI insight"
                        : "Get AI insight"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TargetForm({
  onSubmit,
}: {
  onSubmit: (payload: {
    kind: CardTarget["kind"];
    description: string;
    target_price_cents: number | null;
    target_date: string | null;
  }) => Promise<void>;
}) {
  const [kind, setKind] = useState<CardTarget["kind"]>("sell_price");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const wantsPrice = kind === "sell_price";
  const wantsDate = kind === "flip_by" || kind === "hold_until";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!description.trim() || submitting) return;
        setSubmitting(true);
        try {
          await onSubmit({
            kind,
            description: description.trim(),
            target_price_cents:
              wantsPrice && price.trim() !== ""
                ? Math.round(Number(price) * 100)
                : null,
            target_date: wantsDate && date ? date : null,
          });
          setDescription("");
          setPrice("");
          setDate("");
        } finally {
          setSubmitting(false);
        }
      }}
      className="mt-2 space-y-1.5 border border-[#24282D] bg-[#0B0D0F] p-2"
    >
      <div className="flex gap-1.5">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as CardTarget["kind"])}
          className="border border-[#343941] bg-[#0F1216] px-1.5 py-1 text-[11px] text-[#E6E8EB] focus:outline-none"
        >
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {wantsPrice ? (
          <input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Target $"
            className="w-24 border border-[#343941] bg-[#0F1216] px-1.5 py-1 text-[11px] text-[#E6E8EB] focus:outline-none"
          />
        ) : null}
        {wantsDate ? (
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-[#343941] bg-[#0F1216] px-1.5 py-1 text-[11px] text-[#E6E8EB] focus:outline-none"
          />
        ) : null}
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Describe the goal or plan (e.g., 'Cross-grade to PSA 10, sell before draft hype fades')"
        className="w-full border border-[#343941] bg-[#0F1216] px-1.5 py-1 text-[11px] text-[#E6E8EB] focus:outline-none"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!description.trim() || submitting}
          className="border border-[#20B26B] bg-[#20B26B] px-2.5 py-1 text-[11px] font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save target"}
        </button>
      </div>
    </form>
  );
}
