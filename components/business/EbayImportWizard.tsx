"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { EbayImportJob } from "@/types";

type ImportType = "listings" | "sales";
type WizardStep = "choose" | "configuring" | "running" | "done";

interface Props {
  onClose: () => void;
  onComplete?: () => void;
}

export default function EbayImportWizard({ onClose, onComplete }: Props) {
  const [step, setStep] = useState<WizardStep>("choose");
  const [importType, setImportType] = useState<ImportType>("listings");
  const [lookbackDays, setLookbackDays] = useState(90);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<EbayImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/business/ebay/import-jobs/${id}`);
      if (!res.ok) return;
      const data: EbayImportJob = await res.json();
      setJob(data);

      if (data.status === "completed" || data.status === "failed") {
        stopPolling();
        setStep("done");
        if (data.status === "completed") onComplete?.();
      }
    } catch {
      // Non-fatal polling error — keep trying
    }
  }, [stopPolling, onComplete]);

  useEffect(() => {
    if (!jobId || step !== "running") return;

    // Poll immediately, then every 2 seconds
    pollJob(jobId);
    pollRef.current = setInterval(() => pollJob(jobId), 2000);

    return stopPolling;
  }, [jobId, step, pollJob, stopPolling]);

  async function startImport() {
    setError(null);

    const url =
      importType === "listings"
        ? "/api/business/ebay/listings/import"
        : "/api/business/ebay/sales/import";

    const body =
      importType === "sales"
        ? JSON.stringify({ lookback_days: lookbackDays })
        : undefined;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start import");

      setJobId(data.jobId);
      setStep("running");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start import");
    }
  }

  const progress =
    job && job.total_count && job.total_count > 0
      ? Math.round((job.processed_count / job.total_count) * 100)
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#111827] p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            {step === "choose" || step === "configuring"
              ? "Import from eBay"
              : step === "running"
              ? "Importing…"
              : job?.status === "failed"
              ? "Import Failed"
              : "Import Complete"}
          </h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xl leading-none">
            ×
          </button>
        </div>

        {/* Step: Choose */}
        {(step === "choose" || step === "configuring") && (
          <div className="space-y-4">
            <p className="text-sm text-white/50">What would you like to import?</p>

            <div className="grid grid-cols-2 gap-3">
              {(["listings", "sales"] as ImportType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setImportType(t); setStep("configuring"); }}
                  className={`rounded-xl border p-4 text-left transition ${
                    importType === t && step === "configuring"
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <p className="text-sm font-semibold text-white capitalize">{t}</p>
                  <p className="mt-1 text-xs text-white/40">
                    {t === "listings"
                      ? "Active eBay listings → inventory"
                      : "Past eBay orders → sales ledger"}
                  </p>
                </button>
              ))}
            </div>

            {step === "configuring" && importType === "sales" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/60">
                  How far back to look?
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[30, 90, 180, 365].map((days) => (
                    <button
                      key={days}
                      onClick={() => setLookbackDays(days)}
                      className={`rounded-lg border py-2 text-xs font-medium transition ${
                        lookbackDays === days
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/70"
                      }`}
                    >
                      {days === 365 ? "1 yr" : `${days}d`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === "configuring" && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setStep("choose")}
                  className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm font-medium text-white/60 hover:text-white transition"
                >
                  Back
                </button>
                <button
                  onClick={startImport}
                  className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition"
                >
                  Start Import
                </button>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
            )}
          </div>
        )}

        {/* Step: Running */}
        {step === "running" && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">
              Importing {importType} from eBay — you can close this window and check back later.
            </p>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-white/40">
                <span>{job?.processed_count ?? 0} processed</span>
                {job?.total_count ? <span>{job.total_count} total</span> : <span>Counting…</span>}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${progress ?? 5}%` }}
                />
              </div>
              {progress !== null && (
                <p className="text-right text-xs text-white/40">{progress}%</p>
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white transition">
                Close (runs in background)
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="space-y-4">
            {job?.status === "failed" ? (
              <>
                <div className="rounded-xl bg-red-500/10 p-4">
                  <p className="text-sm font-semibold text-red-400">Import failed</p>
                  {job.error_message && (
                    <p className="mt-1 text-xs text-red-400/70">{job.error_message}</p>
                  )}
                </div>
                <button
                  onClick={() => { setStep("choose"); setJob(null); setJobId(null); setError(null); }}
                  className="w-full rounded-lg bg-white/10 py-2.5 text-sm font-medium text-white hover:bg-white/15 transition"
                >
                  Try Again
                </button>
              </>
            ) : (
              <>
                <div className="rounded-xl bg-emerald-500/10 p-4">
                  <p className="text-sm font-semibold text-emerald-400">
                    Import complete
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    {job?.processed_count ?? 0}{" "}
                    {importType === "listings" ? "listing" : "order"}
                    {(job?.processed_count ?? 0) !== 1 ? "s" : ""} processed
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition"
                >
                  Done
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
