"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Surface } from "@/components/ui/Surface";
import { createClient } from "@/lib/supabase/client";
import { uploadBulkImages } from "@/lib/bulk/upload";
import type {
  BulkBatch,
  BulkItemView,
  BulkStrategy,
  BulkItemStatus,
} from "@/types/bulk";

// ================================================================
// Types
// ================================================================

type FilterStrategy = BulkStrategy | "all" | "needs_review";

// ================================================================
// Helpers
// ================================================================

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

const STRATEGY_STYLES: Record<BulkStrategy | "skip", string> = {
  single:          "bg-blue-900/40 text-blue-300 border border-blue-800/50",
  multi_quantity:  "bg-purple-900/40 text-purple-300 border border-purple-800/50",
  bundle_candidate:"bg-amber-900/40 text-amber-300 border border-amber-800/50",
  skip:            "bg-red-900/40 text-red-400 border border-red-800/50",
};

const STRATEGY_LABELS: Record<BulkStrategy, string> = {
  single:          "Single",
  multi_quantity:  "Multi-Qty",
  bundle_candidate:"Bundle",
  skip:            "Skip",
};

// ================================================================
// Upload Panel
// ================================================================

function UploadPanel({
  batchId,
  onUploaded,
}: {
  batchId: string;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (fileArray.length === 0) {
      setUploadError("Please select image files only.");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      // Step 1: Get the authenticated user's ID for the storage path
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Step 2: Upload all images to Supabase Storage ("bulk-images" bucket)
      const uploadResults = await uploadBulkImages(fileArray, user.id);

      const successUrls: string[] = [];
      const failedCount = uploadResults.filter((r) => !r.ok).length;

      for (const result of uploadResults) {
        if (result.ok) {
          successUrls.push(result.publicUrl);
        }
      }

      if (successUrls.length === 0) {
        setUploadError("All uploads failed. Check that the 'bulk-images' storage bucket exists.");
        return;
      }

      if (failedCount > 0) {
        setUploadError(`${failedCount} of ${fileArray.length} images failed to upload.`);
      }

      // Step 3: Register the uploaded image URLs as batch items
      const itemPayloads = successUrls.map((url) => ({ primaryImageUrl: url }));

      const CHUNK_SIZE = 20;
      for (let i = 0; i < itemPayloads.length; i += CHUNK_SIZE) {
        const chunk = itemPayloads.slice(i, i + CHUNK_SIZE);

        const res = await fetch(`/api/bulk/batches/${batchId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: chunk }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Failed to register items");
        }
      }

      onUploaded();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed transition-colors p-8 text-center cursor-pointer ${
        dragOver
          ? "border-blue-500 bg-blue-900/20"
          : "border-white/15 hover:border-white/25 bg-white/2"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploading ? (
        <div>
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-300">Uploading images…</p>
        </div>
      ) : (
        <div>
          <svg className="w-10 h-10 text-gray-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm font-medium text-white mb-1">Drop card images here</p>
          <p className="text-xs text-gray-500">
            Select multiple images — one per card (front). JPEG, PNG, or WebP.
          </p>
        </div>
      )}

      {uploadError && (
        <p className="mt-3 text-sm text-red-400">{uploadError}</p>
      )}
    </div>
  );
}

// ================================================================
// Item Row
// ================================================================

function ItemRow({
  view,
  onApprove,
  onSkip,
}: {
  view: BulkItemView;
  onApprove: (itemId: string) => void;
  onSkip: (itemId: string) => void;
}) {
  const { item, identification, pricing, strategy } = view;

  const isPending = item.status === "pending" || item.status === "identified";
  const isApproved = item.status === "approved";
  const isSkipped = item.status === "skipped";

  return (
    <tr
      className={`border-t border-white/5 hover:bg-white/2 transition-colors ${
        isSkipped ? "opacity-40" : ""
      }`}
    >
      {/* Thumbnail */}
      <td className="py-3 pl-4 pr-3 w-16">
        {item.primary_image_url ? (
          <div className="w-12 h-16 rounded overflow-hidden bg-gray-800 relative shrink-0">
            {item.primary_image_url.startsWith("data:") ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={item.primary_image_url}
                alt="Card"
                className="w-full h-full object-cover"
              />
            ) : (
              <Image
                src={item.primary_image_url}
                alt="Card"
                fill
                className="object-cover"
                sizes="48px"
              />
            )}
          </div>
        ) : (
          <div className="w-12 h-16 rounded bg-gray-800 flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </td>

      {/* Card identity */}
      <td className="py-3 pr-3 min-w-0">
        {identification ? (
          <div>
            <p className="text-sm font-medium text-white truncate leading-snug">
              {identification.title_candidate ?? "Unknown Card"}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {identification.rookie_flag && (
                <span className="text-xs bg-yellow-900/50 text-yellow-400 px-1.5 py-0.5 rounded">
                  RC
                </span>
              )}
              {identification.insert_parallel_notes && (
                <span className="text-xs text-purple-400 truncate max-w-[120px]">
                  {identification.insert_parallel_notes}
                </span>
              )}
              {identification.needs_review && (
                <span className="text-xs bg-amber-900/40 text-amber-400 px-1.5 py-0.5 rounded">
                  Review needed
                </span>
              )}
            </div>
          </div>
        ) : isPending ? (
          <div>
            <p className="text-sm text-gray-500">Processing…</p>
            <div className="w-24 h-2 bg-gray-700 rounded animate-pulse mt-2" />
          </div>
        ) : (
          <p className="text-sm text-gray-500">—</p>
        )}
      </td>

      {/* Confidence */}
      <td className="py-3 pr-3 text-right w-20">
        {identification ? (
          <span
            className={`text-xs font-mono ${
              identification.confidence >= 0.92
                ? "text-green-400"
                : identification.confidence >= 0.80
                ? "text-yellow-400"
                : "text-red-400"
            }`}
          >
            {formatPct(identification.confidence)}
          </span>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </td>

      {/* Suggested price */}
      <td className="py-3 pr-3 text-right w-24">
        <span className="text-sm text-white">
          {formatCurrency(pricing?.suggested_listing_price)}
        </span>
      </td>

      {/* Est net */}
      <td className="py-3 pr-3 text-right w-20">
        {strategy ? (
          <span
            className={`text-sm font-medium ${
              (strategy.estimated_net_profit ?? 0) >= 0.40
                ? "text-green-400"
                : "text-red-400"
            }`}
          >
            {formatCurrency(strategy.estimated_net_profit)}
          </span>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </td>

      {/* Shipping */}
      <td className="py-3 pr-3 w-16 text-center">
        {strategy?.ese_eligible ? (
          <span className="text-xs bg-cyan-900/40 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-800/40">
            ESE
          </span>
        ) : strategy ? (
          <span className="text-xs text-gray-500">FCM</span>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </td>

      {/* Strategy */}
      <td className="py-3 pr-3 w-28">
        {strategy ? (
          <span
            className={`text-xs px-2 py-1 rounded font-medium ${
              STRATEGY_STYLES[strategy.recommended_strategy as BulkStrategy] ??
              STRATEGY_STYLES.skip
            }`}
          >
            {STRATEGY_LABELS[strategy.recommended_strategy as BulkStrategy] ??
              strategy.recommended_strategy}
          </span>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="py-3 pr-4 w-28 text-right">
        {strategy && !isPending && (
          <div className="flex gap-1.5 justify-end">
            {!isApproved && !isSkipped && strategy.recommended_strategy !== "skip" && (
              <button
                onClick={() => onApprove(item.id)}
                className="text-xs px-2.5 py-1 bg-green-900/50 hover:bg-green-800/60 text-green-400 rounded transition-colors border border-green-800/40"
              >
                Approve
              </button>
            )}
            {!isSkipped && (
              <button
                onClick={() => onSkip(item.id)}
                className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors"
              >
                Skip
              </button>
            )}
            {isApproved && (
              <span className="text-xs text-green-400">✓ Approved</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ================================================================
// Filter Bar
// ================================================================

type ActiveFilter = FilterStrategy | "profitable";

function FilterBar({
  activeFilter,
  onChange,
  counts,
}: {
  activeFilter: ActiveFilter;
  onChange: (f: ActiveFilter) => void;
  counts: Record<string, number>;
}) {
  const filters: Array<{ key: ActiveFilter; label: string }> = [
    { key: "all",             label: `All (${counts.all ?? 0})` },
    { key: "needs_review",   label: `Review (${counts.needs_review ?? 0})` },
    { key: "profitable",     label: `Profitable (${counts.profitable ?? 0})` },
    { key: "single",         label: `Single (${counts.single ?? 0})` },
    { key: "multi_quantity", label: `Multi-Qty (${counts.multi_quantity ?? 0})` },
    { key: "bundle_candidate",label: `Bundle (${counts.bundle_candidate ?? 0})` },
    { key: "skip",           label: `Skip (${counts.skip ?? 0})` },
  ];

  return (
    <div className="flex gap-1.5 flex-wrap">
      {filters.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            activeFilter === key
              ? "bg-blue-600 text-white"
              : "bg-white/6 text-gray-400 hover:bg-white/10 hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ================================================================
// Main Batch Detail Page
// ================================================================

// ----------------------------------------------------------------
// CSV Export helper (runs client-side, no server needed)
// ----------------------------------------------------------------

function exportApprovedAsCsv(items: BulkItemView[], batchName: string) {
  const approved = items.filter((v) => v.item.status === "approved" && v.draft !== null);
  if (approved.length === 0) return;

  const headers = [
    "Title", "Player", "Brand", "Set", "Year", "Card #",
    "Rookie", "Insert/Parallel", "Confidence",
    "List Price", "Est. Sale Price", "Est. Net Profit",
    "ESE Eligible", "Strategy", "Shipping Method", "Qty",
  ];

  const rows = approved.map((v) => {
    const id = v.identification;
    const pricing = v.pricing;
    const strategy = v.strategy;
    const payload = v.draft?.listing_payload_json as Record<string, unknown> | undefined;
    return [
      payload?.title ?? id?.title_candidate ?? "",
      id?.player ?? "",
      id?.brand ?? "",
      id?.set_name ?? "",
      id?.year ?? "",
      id?.card_number ?? "",
      id?.rookie_flag ? "Yes" : "No",
      id?.insert_parallel_notes ?? "",
      id ? `${Math.round(id.confidence * 100)}%` : "",
      pricing?.suggested_listing_price != null ? `$${pricing.suggested_listing_price}` : "",
      pricing?.estimated_sale_price != null ? `$${pricing.estimated_sale_price}` : "",
      strategy?.estimated_net_profit != null ? `$${strategy.estimated_net_profit}` : "",
      strategy?.ese_eligible ? "Yes" : "No",
      strategy?.recommended_strategy ?? "",
      payload?.shipping_method ?? "",
      payload?.quantity ?? "1",
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`);
  });

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bulk-approved-${batchName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------
// Poll interval when batch is processing (ms)
// ----------------------------------------------------------------
const POLL_INTERVAL_MS = 5000;

export default function BulkBatchPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = params.batchId as string;

  const [batch, setBatch] = useState<BulkBatch | null>(null);
  const [items, setItems] = useState<BulkItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<{
    processed: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

  const loadBatch = useCallback(async () => {
    try {
      const res = await fetch(`/api/bulk/batches/${batchId}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to load batch");
        return;
      }

      setBatch(data.batch);
      setItems(data.items ?? []);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  // Auto-poll while batch status is "processing"
  useEffect(() => {
    if (batch?.status !== "processing") return;
    const interval = setInterval(() => { loadBatch(); }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [batch?.status, loadBatch]);

  useEffect(() => {
    loadBatch();
  }, [loadBatch]);

  async function handleProcess() {
    setProcessing(true);
    setProcessResult(null);

    try {
      const res = await fetch(`/api/bulk/batches/${batchId}/process`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Processing failed");
        return;
      }

      setProcessResult(data);
      // Reload to show updated data
      await loadBatch();
    } catch {
      setError("Network error during processing");
    } finally {
      setProcessing(false);
    }
  }

  async function updateItemStatus(itemId: string, status: BulkItemStatus) {
    await fetch(`/api/bulk/batches/${batchId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    // Optimistically update local state
    setItems((prev) =>
      prev.map((view) =>
        view.item.id === itemId
          ? { ...view, item: { ...view.item, status } }
          : view
      )
    );
  }

  // ----------------------------------------------------------------
  // Compute filter counts
  // ----------------------------------------------------------------
  const filterCounts = {
    all:             items.length,
    needs_review:    items.filter((v) => v.identification?.needs_review).length,
    profitable:      items.filter((v) => (v.strategy?.estimated_net_profit ?? 0) >= 0.40).length,
    single:          items.filter((v) => v.strategy?.recommended_strategy === "single").length,
    multi_quantity:  items.filter((v) => v.strategy?.recommended_strategy === "multi_quantity").length,
    bundle_candidate:items.filter((v) => v.strategy?.recommended_strategy === "bundle_candidate").length,
    skip:            items.filter((v) => v.strategy?.recommended_strategy === "skip" || v.strategy?.not_worth_listing).length,
  };

  // ----------------------------------------------------------------
  // Apply active filter
  // ----------------------------------------------------------------
  const filteredItems = items.filter((view) => {
    switch (activeFilter) {
      case "all":              return true;
      case "needs_review":     return view.identification?.needs_review === true;
      case "profitable":       return (view.strategy?.estimated_net_profit ?? 0) >= 0.40;
      case "single":           return view.strategy?.recommended_strategy === "single";
      case "multi_quantity":   return view.strategy?.recommended_strategy === "multi_quantity";
      case "bundle_candidate": return view.strategy?.recommended_strategy === "bundle_candidate";
      case "skip":             return view.strategy?.recommended_strategy === "skip" || view.strategy?.not_worth_listing;
      default:                 return true;
    }
  });

  // ----------------------------------------------------------------
  // Batch stats for KPI strip
  // ----------------------------------------------------------------
  const processedItems = items.filter((v) => v.strategy !== null);
  const approvedItems  = items.filter((v) => v.item.status === "approved");
  const totalNetProfit = approvedItems.reduce(
    (sum, v) => sum + (v.strategy?.estimated_net_profit ?? 0),
    0
  );

  if (loading) {
    return (
      <>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="h-8 w-48 bg-gray-700 rounded animate-pulse mb-6" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-gray-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (error && !batch) {
    return (
      <>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Surface>
            <p className="text-red-400">{error}</p>
            <button
              onClick={() => router.push("/bulk")}
              className="mt-3 text-sm text-blue-400 hover:text-blue-300"
            >
              ← Back to batches
            </button>
          </Surface>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Back link */}
        <button
          onClick={() => router.push("/bulk")}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Bulk Mode
        </button>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">{batch?.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {batch?.item_count ?? items.length} cards · {batch?.status}
            </p>
          </div>

          {/* Header action buttons */}
          <div className="flex items-center gap-2">
            {/* Export CSV — only show when there are approved items */}
            {items.some((v) => v.item.status === "approved") && (
              <button
                onClick={() => exportApprovedAsCsv(items, batch?.name ?? "batch")}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors border border-white/10"
                title="Export approved items as CSV"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </button>
            )}

            {/* Analyze All button */}
            {batch?.status !== "archived" && (
              <button
                onClick={handleProcess}
                disabled={processing || batch?.status === "processing" || items.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {processing || batch?.status === "processing" ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Analyze All
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800/40 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Process result summary */}
        {processResult && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-green-900/20 border border-green-800/30 text-sm text-green-300">
            ✓ Processed {processResult.processed} cards
            {processResult.skipped > 0 && `, skipped ${processResult.skipped}`}
            {processResult.errors.length > 0 && (
              <span className="text-amber-400 ml-2">
                ({processResult.errors.length} errors)
              </span>
            )}
          </div>
        )}

        {/* KPI strip */}
        {processedItems.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              {
                label: "Processed",
                value: `${processedItems.length} / ${items.length}`,
                sub: "cards",
              },
              {
                label: "Approved",
                value: String(approvedItems.length),
                sub: "to list",
                highlight: true,
              },
              {
                label: "Est. Net (approved)",
                value: formatCurrency(totalNetProfit),
                sub: "after fees + shipping",
                highlight: totalNetProfit > 0,
              },
              {
                label: "ESE Eligible",
                value: String(
                  processedItems.filter((v) => v.strategy?.ese_eligible).length
                ),
                sub: "of processed",
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-lg border border-white/8 bg-white/2 px-4 py-3"
              >
                <p className="text-xs text-gray-500 uppercase tracking-wide">{kpi.label}</p>
                <p
                  className={`text-xl font-bold mt-1 ${
                    kpi.highlight ? "text-green-400" : "text-white"
                  }`}
                >
                  {kpi.value}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{kpi.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Upload panel */}
        {batch?.status !== "processing" && (
          <div className="mb-6">
            <UploadPanel
              batchId={batchId}
              onUploaded={async () => {
                await loadBatch();
                // Auto-kick off analysis right after new images are registered
                void handleProcess();
              }}
            />
          </div>
        )}

        {/* Items table */}
        {items.length > 0 && (
          <Surface>
            {/* Filter bar */}
            <div className="mb-4">
              <FilterBar
                activeFilter={activeFilter}
                onChange={setActiveFilter}
                counts={filterCounts}
              />
            </div>

            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-left min-w-[700px]">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wide">
                    <th className="pb-3 pl-4 pr-3 w-16">Image</th>
                    <th className="pb-3 pr-3">Card</th>
                    <th className="pb-3 pr-3 text-right w-20">Conf.</th>
                    <th className="pb-3 pr-3 text-right w-24">List Price</th>
                    <th className="pb-3 pr-3 text-right w-20">Est. Net</th>
                    <th className="pb-3 pr-3 text-center w-16">Ship</th>
                    <th className="pb-3 pr-3 w-28">Strategy</th>
                    <th className="pb-3 pr-4 text-right w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-500 text-sm">
                        No items match this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((view) => (
                      <ItemRow
                        key={view.item.id}
                        view={view}
                        onApprove={(id) => updateItemStatus(id, "approved")}
                        onSkip={(id) => updateItemStatus(id, "skipped")}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Approve all profitable */}
            {processedItems.length > 0 &&
              items.some(
                (v) =>
                  (v.strategy?.estimated_net_profit ?? 0) >= 0.40 &&
                  v.item.status === "priced" &&
                  v.strategy?.recommended_strategy !== "skip"
              ) && (
                <div className="mt-4 pt-4 border-t border-white/5 flex justify-end">
                  <button
                    onClick={async () => {
                      const toApprove = items.filter(
                        (v) =>
                          (v.strategy?.estimated_net_profit ?? 0) >= 0.40 &&
                          v.item.status === "priced" &&
                          v.strategy?.recommended_strategy !== "skip"
                      );
                      await Promise.all(
                        toApprove.map((v) => updateItemStatus(v.item.id, "approved"))
                      );
                    }}
                    className="text-sm px-4 py-2 bg-green-800/50 hover:bg-green-700/60 text-green-300 rounded-lg border border-green-700/40 transition-colors"
                  >
                    ✓ Approve all profitable
                  </button>
                </div>
              )}
          </Surface>
        )}

        {/* Empty state */}
        {items.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-3xl mb-3">📷</div>
            <p className="text-white font-medium mb-1">No cards yet</p>
            <p className="text-sm">
              Drop card images above — analysis starts automatically.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
