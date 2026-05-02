"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type FlaggedRow = {
  id: string;
  list_price_cents: number;
  listed_at: string;
  day60_triggered_at: string | null;
  marketplace_cards: { title: string; player: string; year: number; grade: string };
};

type Action = "remove" | "return_to_seller" | "convert_to_self_serve";

export default function FlaggedClient({ rows }: { rows: FlaggedRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, action: Action) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/marketplace/listings/${id}/flagged-decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "decision_failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400">No flagged listings.</p>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      <table className="w-full text-sm border border-gray-800 rounded-lg overflow-hidden">
        <thead className="bg-gray-900 text-gray-400 text-xs uppercase">
          <tr>
            <th className="text-left p-3">Listing</th>
            <th className="text-right p-3">Price</th>
            <th className="text-left p-3">Listed</th>
            <th className="text-right p-3">Decision</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-gray-800">
              <td className="p-3">
                <div className="font-medium">{r.marketplace_cards.title}</div>
                <div className="text-xs text-gray-500">
                  {r.marketplace_cards.year} · {r.marketplace_cards.grade}
                </div>
              </td>
              <td className="p-3 text-right">
                ${(r.list_price_cents / 100).toLocaleString()}
              </td>
              <td className="p-3 text-xs text-gray-400">
                {new Date(r.listed_at).toLocaleDateString()}
              </td>
              <td className="p-3 text-right">
                <div className="inline-flex gap-2">
                  <button
                    onClick={() => decide(r.id, "convert_to_self_serve")}
                    disabled={busyId === r.id}
                    className="px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-xs disabled:opacity-50"
                  >
                    Self-serve
                  </button>
                  <button
                    onClick={() => decide(r.id, "return_to_seller")}
                    disabled={busyId === r.id}
                    className="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-xs disabled:opacity-50"
                  >
                    Return
                  </button>
                  <button
                    onClick={() => decide(r.id, "remove")}
                    disabled={busyId === r.id}
                    className="px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-xs disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
