"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { BusinessInventoryItem } from "@/types";
import {
  allInCostCents,
  breakEvenGrade,
  buildGradingForecast,
  type GradingForecastRow,
} from "@/lib/business/grading-forecast";
import {
  formatGradingCountdown,
  getGradingCountdown,
} from "@/lib/business/grading-turnaround";

const CardProfileDrawer = dynamic(
  () => import("@/components/business/CardProfileDrawer"),
  { ssr: false }
);

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmt(cents: number): string {
  return MONEY.format(cents / 100);
}

function fmtSigned(cents: number): string {
  return `${cents < 0 ? "-" : "+"}${fmt(Math.abs(cents))}`;
}

function pnlClass(cents: number): string {
  if (cents > 0) return "text-[#20B26B]";
  if (cents < 0) return "text-[#E05C5C]";
  return "text-[#B8C0CC]";
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtIsoDate(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  return fmtDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

interface GradingRow {
  item: BusinessInventoryItem;
  costCents: number;
  forecast: Map<string, GradingForecastRow>;
  breakEven: string | null;
  countdown: ReturnType<typeof getGradingCountdown>;
}

/** Sum of value/profit across cards if every card came back at `grade`. */
function scenarioFor(rows: GradingRow[], grade: string) {
  let valueCents = 0;
  let costCents = 0;
  let estimated = 0;
  for (const row of rows) {
    const f = row.forecast.get(grade);
    if (!f) continue;
    valueCents += f.valueCents;
    costCents += row.costCents;
    estimated += 1;
  }
  return { valueCents, profitCents: valueCents - costCents, estimated };
}

export default function AtGradingPage() {
  const router = useRouter();
  const [items, setItems] = useState<BusinessInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileItemId, setProfileItemId] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    try {
      const res = await fetch("/api/business/inventory", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login?redirect=/business/grading");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to load inventory");
      setItems(Array.isArray(data?.items) ? data.items : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const rows = useMemo<GradingRow[]>(() => {
    return items
      .filter((item) => item.status === "at_grading")
      .map((item) => {
        const costCents = allInCostCents(item);
        const forecastRows = buildGradingForecast(item.grading_value_estimates, costCents);
        return {
          item,
          costCents,
          forecast: new Map(forecastRows.map((r) => [r.grade, r])),
          breakEven: breakEvenGrade(forecastRows),
          countdown: getGradingCountdown(item.grading_sent_date, item.grading_turnaround_days),
        };
      })
      .sort(
        (a, b) =>
          (a.countdown?.daysRemaining ?? Number.POSITIVE_INFINITY) -
          (b.countdown?.daysRemaining ?? Number.POSITIVE_INFINITY)
      );
  }, [items]);

  // Grade columns: every grade any card has an estimate for, highest first.
  const grades = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) for (const g of row.forecast.keys()) set.add(g);
    return [...set].sort((a, b) => (Number(b) || 0) - (Number(a) || 0));
  }, [rows]);

  const totals = useMemo(() => {
    const costCents = rows.reduce((sum, r) => sum + r.costCents, 0);
    const feeCents = rows.reduce((sum, r) => sum + (r.item.grading_fee_cents ?? 0), 0);
    const nextBack = rows.find((r) => r.countdown)?.countdown ?? null;
    return { costCents, feeCents, nextBack };
  }, [rows]);

  const scenarioGrades = grades.slice(0, 2);

  return (
    <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
      <header className="flex items-end justify-between gap-3 px-4 pb-3 pt-4">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
            Inventory
          </div>
          <h1 className="text-lg font-semibold">At Grading</h1>
        </div>
        <div className="text-[11px] text-[#77808C]">
          Values are your per-grade estimates, before selling fees.
        </div>
      </header>

      <div className="overflow-x-auto border-y border-[#24282D] bg-[#0B0D0F]">
        <div
          className="grid min-w-[920px] divide-x divide-[#24282D]"
          style={{ gridTemplateColumns: `repeat(${3 + scenarioGrades.length}, minmax(0, 1fr))` }}
        >
          <SummaryCell label="Cards at grading" value={loading ? "—" : String(rows.length)} />
          <SummaryCell
            label="All-in cost"
            value={loading ? "—" : fmt(totals.costCents)}
            sub={totals.feeCents > 0 ? `incl. ${fmt(totals.feeCents)} grading fees` : undefined}
          />
          {scenarioGrades.map((grade) => {
            const s = scenarioFor(rows, grade);
            return (
              <SummaryCell
                key={grade}
                label={`If all ${grade}s`}
                value={fmt(s.valueCents)}
                sub={
                  <>
                    <span className={pnlClass(s.profitCents)}>{fmtSigned(s.profitCents)}</span>
                    {s.estimated < rows.length
                      ? ` · ${s.estimated} of ${rows.length} estimated`
                      : " profit"}
                  </>
                }
              />
            );
          })}
          <SummaryCell
            label="Next back"
            value={totals.nextBack ? fmtDate(totals.nextBack.estimatedReturnDate) : "—"}
            sub={totals.nextBack ? formatGradingCountdown(totals.nextBack) : undefined}
          />
        </div>
      </div>

      <section className="p-4">
        {error ? (
          <div className="border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">
            {error}
          </div>
        ) : loading ? (
          <div className="h-[240px] animate-pulse border border-[#24282D] bg-[#0B0D0F]" />
        ) : rows.length === 0 ? (
          <div className="border border-[#24282D] bg-[#0B0D0F] px-4 py-10 text-center text-sm text-[#77808C]">
            No cards at grading. Send a card from the add-card form or the card&apos;s profile.
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#24282D] bg-[#0B0D0F]">
            <table className="w-full min-w-[920px] text-[13px]">
              <thead>
                <tr className="border-b border-[#24282D] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#77808C]">
                  <th className="px-3 py-2.5">Card</th>
                  <th className="px-3 py-2.5">Submission</th>
                  <th className="px-3 py-2.5">Return</th>
                  <th className="px-3 py-2.5 text-right">All-in cost</th>
                  {grades.map((g) => (
                    <th key={g} className="px-3 py-2.5 text-right">
                      If {g}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right">Break-even</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2227]">
                {rows.map((row) => {
                  const { item, countdown } = row;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setProfileItemId(item.id)}
                      className="cursor-pointer transition-colors hover:bg-[#111315]"
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-[#E6E8EB]">{item.title}</div>
                        {item.card_number ? (
                          <div className="text-[11px] text-[#77808C]">#{item.card_number}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-[#B8C0CC]">
                        <div>
                          {[item.grading_submitted_company, item.grading_service]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                        <div className="text-[11px] text-[#77808C]">
                          Sent {fmtIsoDate(item.grading_sent_date)}
                          {item.grading_fee_cents ? ` · ${fmt(item.grading_fee_cents)} fee` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {countdown ? (
                          <>
                            <div className="text-[#B8C0CC]">{fmtDate(countdown.estimatedReturnDate)}</div>
                            <div
                              className={`text-[11px] ${
                                countdown.overdue ? "text-[#E05C5C]" : "text-[#3B82F6]"
                              }`}
                            >
                              {formatGradingCountdown(countdown)}
                            </div>
                          </>
                        ) : (
                          <span className="text-[#77808C]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-data tabular-nums">
                        {fmt(row.costCents)}
                      </td>
                      {grades.map((g) => {
                        const f = row.forecast.get(g);
                        return (
                          <td key={g} className="px-3 py-2.5 text-right font-data tabular-nums">
                            {f ? (
                              <>
                                <div className="text-[#E6E8EB]">{fmt(f.valueCents)}</div>
                                <div className={`text-[11px] ${pnlClass(f.profitCents)}`}>
                                  {fmtSigned(f.profitCents)}
                                </div>
                              </>
                            ) : (
                              <span className="text-[#4F5863]">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right">
                        {row.forecast.size === 0 ? (
                          <span className="text-[11px] text-[#77808C]">Add estimates</span>
                        ) : row.breakEven ? (
                          <span className="font-semibold text-[#E6E8EB]">
                            {item.grading_submitted_company ?? ""} {row.breakEven}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#E05C5C]">None covers cost</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CardProfileDrawer
        isOpen={profileItemId != null}
        itemId={profileItemId}
        item={profileItemId ? items.find((it) => it.id === profileItemId) ?? null : null}
        mode="business"
        onClose={() => setProfileItemId(null)}
        onSaved={(updated) => {
          setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
        }}
      />
    </main>
  );
}

function SummaryCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
        {label}
      </div>
      <div className="mt-0.5 font-data text-[13px] font-semibold tabular-nums text-[#E6E8EB]">
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[10px] text-[#77808C]">{sub}</div> : null}
    </div>
  );
}
