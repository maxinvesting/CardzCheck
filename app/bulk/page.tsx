"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Surface } from "@/components/ui/Surface";
import type { BulkBatch } from "@/types/bulk";

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_STYLES: Record<string, string> = {
  pending:    "bg-gray-700/50 text-gray-300",
  processing: "bg-blue-900/50 text-blue-300",
  ready:      "bg-green-900/50 text-green-300",
  archived:   "bg-gray-800/50 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  pending:    "Pending",
  processing: "Processing",
  ready:      "Ready",
  archived:   "Archived",
};

// ----------------------------------------------------------------
// Create Batch Modal
// ----------------------------------------------------------------

function CreateBatchModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (batch: BulkBatch) => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/bulk/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create batch");
        return;
      }

      onCreated(data.batch);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-[#1a2332] border border-white/10 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-1">New Batch</h2>
        <p className="text-sm text-gray-400 mb-5">
          Give this batch a name so you can identify it later (e.g.{' '}
          {'"'}Prizm Commons Box 1{'"'}).
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Batch name"
            maxLength={120}
            autoFocus
            className="w-full rounded-lg bg-[#0f1419] border border-white/10 text-white px-3 py-2.5 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
          />

          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? "Creating…" : "Create Batch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Batch Card
// ----------------------------------------------------------------

function BatchCard({
  batch,
  onClick,
}: {
  batch: BulkBatch;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-white/8 bg-white/3 hover:bg-white/6 hover:border-white/15 transition-all p-5 group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white truncate group-hover:text-blue-300 transition-colors">
            {batch.name}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Created {formatDate(batch.created_at)}
          </p>
        </div>

        <span
          className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[batch.status] ?? STATUS_STYLES.pending}`}
        >
          {STATUS_LABELS[batch.status] ?? batch.status}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
        <span>{batch.item_count} {batch.item_count === 1 ? "card" : "cards"}</span>
        {batch.status === "ready" && (
          <span className="text-green-400">Ready to review →</span>
        )}
        {batch.status === "processing" && (
          <span className="text-blue-400 animate-pulse">Processing…</span>
        )}
      </div>
    </button>
  );
}

// ----------------------------------------------------------------
// Main Page
// ----------------------------------------------------------------

export default function BulkModePage() {
  const router = useRouter();
  const [batches, setBatches] = useState<BulkBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadBatches();
  }, []);

  async function loadBatches() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/bulk/batches");
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to load batches");
        return;
      }

      setBatches(data.batches ?? []);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  function handleBatchCreated(batch: BulkBatch) {
    setBatches((prev) => [batch, ...prev]);
    setShowCreateModal(false);
    // Navigate immediately to the new batch so the user can start uploading
    router.push(`/bulk/${batch.id}`);
  }

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Bulk Mode</h1>
            <p className="text-sm text-gray-400 mt-1">
              Process large volumes of $1–$10 cards for eBay listing.
              Upload images, get instant pricing, and generate ready-to-list drafts.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Batch
          </button>
        </div>

        {/* Quick stats explainer */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { icon: "📦", label: "Upload cards", desc: "Add front/back images" },
            { icon: "🤖", label: "Auto-identify", desc: "AI reads player, set, year" },
            { icon: "💰", label: "Get pricing", desc: "Net profit + ESE check" },
          ].map((step) => (
            <div
              key={step.label}
              className="rounded-lg border border-white/8 bg-white/2 p-3 text-center"
            >
              <div className="text-xl mb-1">{step.icon}</div>
              <p className="text-xs font-medium text-white">{step.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
            </div>
          ))}
        </div>

        {/* Batch list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 rounded-xl bg-white/3 animate-pulse border border-white/5"
              />
            ))}
          </div>
        ) : error ? (
          <Surface>
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={loadBatches}
              className="mt-3 text-sm text-blue-400 hover:text-blue-300"
            >
              Try again
            </button>
          </Surface>
        ) : batches.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-white font-medium mb-1">No batches yet</p>
            <p className="text-sm text-gray-500 mb-5">
              Create your first batch to start processing bulk inventory.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Create First Batch
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                onClick={() => router.push(`/bulk/${batch.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateBatchModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleBatchCreated}
        />
      )}
    </>
  );
}
