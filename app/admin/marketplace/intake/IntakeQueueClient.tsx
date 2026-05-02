"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Pipeline = "standard" | "elite" | "grails";

export type IntakeRow = {
  id: string;
  title: string;
  player: string;
  year: number;
  manufacturer: string;
  grade: string;
  grading_service: string;
  estimated_value_cents: number;
  created_at: string;
};

export default function IntakeQueueClient({ rows }: { rows: IntakeRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(
    cardId: string,
    decision: "approve" | "reject",
    pipeline?: Pipeline
  ) {
    setBusyId(cardId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/marketplace/intake/${cardId}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, pipeline }),
      });
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
    return (
      <p className="text-sm text-gray-400">No cards awaiting approval.</p>
    );
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
            <th className="text-left p-3">Card</th>
            <th className="text-left p-3">Grade</th>
            <th className="text-right p-3">Est. value</th>
            <th className="text-right p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-gray-800">
              <td className="p-3">
                <div className="font-medium">{r.title}</div>
                <div className="text-xs text-gray-500">
                  {r.year} {r.manufacturer} · {r.player}
                </div>
              </td>
              <td className="p-3">
                {r.grading_service} {r.grade}
              </td>
              <td className="p-3 text-right">
                ${(r.estimated_value_cents / 100).toLocaleString()}
              </td>
              <td className="p-3 text-right">
                <div className="inline-flex gap-2">
                  <button
                    onClick={() => decide(r.id, "approve", "standard")}
                    disabled={busyId === r.id}
                    className="px-2 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-xs disabled:opacity-50"
                  >
                    Standard
                  </button>
                  <button
                    onClick={() => decide(r.id, "approve", "elite")}
                    disabled={busyId === r.id}
                    className="px-2 py-1 rounded bg-purple-700 hover:bg-purple-600 text-xs disabled:opacity-50"
                  >
                    Elite
                  </button>
                  <button
                    onClick={() => decide(r.id, "approve", "grails")}
                    disabled={busyId === r.id}
                    className="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-xs disabled:opacity-50"
                  >
                    Grails
                  </button>
                  <button
                    onClick={() => decide(r.id, "reject")}
                    disabled={busyId === r.id}
                    className="px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-xs disabled:opacity-50"
                  >
                    Reject
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
