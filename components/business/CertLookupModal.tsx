"use client";

import { useState, useRef, useEffect } from "react";
import type { PendingInventoryCard } from "./AddCardToInventoryModal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called when PSA lookup succeeds — passes pre-filled card data to open AddCardToInventoryModal */
  onCardFound: (card: PendingInventoryCard & { cert_number: string }) => void;
}

interface PSALookupResult {
  card: {
    cert_number: string;
    player_name: string;
    year?: string;
    set_name?: string;
    card_number?: string;
    parallel_type?: string;
    grader: string;
    grade?: string;
    imageUrl?: string;
    stock_image_url?: string;
    grade_description?: string;
    population?: number;
    population_higher?: number;
  };
  raw: {
    CertNumber: string;
    Year: string;
    Brand: string;
    Subject: string;
    CardNumber: string;
    Variety: string;
    CardGrade: string;
    GradeDescription: string;
    LabelType: string;
    TotalPopulation: number;
    PopulationHigher: number;
    ItemStatus: string;
  };
  imageUrl: string | null;
}

export default function CertLookupModal({ isOpen, onClose, onCardFound }: Props) {
  const [certInput, setCertInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PSALookupResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCertInput("");
      setError(null);
      setResult(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLookup = async () => {
    const cert = certInput.trim().replace(/\D/g, "");
    if (!cert) {
      setError("Please enter a cert number");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/psa/cert/${encodeURIComponent(cert)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToInventory = () => {
    if (!result) return;
    onCardFound({
      cert_number: result.card.cert_number,
      player_name: result.card.player_name,
      year: result.card.year,
      set_name: result.card.set_name,
      card_number: result.card.card_number,
      parallel_type: result.card.parallel_type,
      grader: result.card.grader,
      grade: result.card.grade,
      imageUrl: result.card.imageUrl,
      stock_image_url: result.card.stock_image_url,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#111827] border border-white/[0.08] rounded-2xl w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="p-5 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* PSA badge */}
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white">
              PSA
            </span>
            <h2 className="text-base font-semibold text-white">Lookup by Cert #</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Cert input */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">PSA Cert Number</label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={certInput}
                onChange={(e) => setCertInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
                placeholder="e.g. 12345678"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
              <button
                type="button"
                onClick={handleLookup}
                disabled={loading || !certInput.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Looking up…
                  </span>
                ) : "Look Up"}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              {/* Card preview */}
              <div className="flex gap-3 p-3 bg-gray-800/60 border border-gray-700/50 rounded-xl">
                {result.imageUrl ? (
                  <img
                    src={result.imageUrl}
                    alt={result.card.player_name}
                    className="w-16 h-22 object-cover rounded-lg flex-shrink-0"
                    style={{ height: "88px" }}
                  />
                ) : (
                  <div className="w-16 flex-shrink-0 rounded-lg bg-gray-700 flex items-center justify-center" style={{ height: "88px" }}>
                    <svg className="w-7 h-7 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{result.card.player_name}</p>
                  {result.card.year && (
                    <p className="text-xs text-gray-400">{result.card.year}</p>
                  )}
                  {result.card.set_name && (
                    <p className="text-xs text-gray-400 truncate">{result.card.set_name}</p>
                  )}
                  {result.card.parallel_type && (
                    <p className="text-xs text-emerald-400 truncate">{result.card.parallel_type}</p>
                  )}
                  {result.card.grade && (
                    <p className="text-xs text-blue-400 font-semibold">
                      PSA {result.card.grade}
                      {result.card.grade_description ? ` — ${result.card.grade_description}` : ""}
                    </p>
                  )}
                </div>
              </div>

              {/* Pop report + status */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-gray-800/40 rounded-lg">
                  <p className="text-[10px] text-gray-500 mb-0.5">Cert #</p>
                  <p className="text-xs font-medium text-white">{result.raw.CertNumber}</p>
                </div>
                <div className="p-2 bg-gray-800/40 rounded-lg">
                  <p className="text-[10px] text-gray-500 mb-0.5">Pop</p>
                  <p className="text-xs font-medium text-white">{result.raw.TotalPopulation ?? "—"}</p>
                </div>
                <div className="p-2 bg-gray-800/40 rounded-lg">
                  <p className="text-[10px] text-gray-500 mb-0.5">Pop Higher</p>
                  <p className="text-xs font-medium text-white">{result.raw.PopulationHigher ?? "—"}</p>
                </div>
              </div>

              {result.raw.ItemStatus && result.raw.ItemStatus !== "Y" && (
                <div className="p-2.5 bg-amber-900/20 border border-amber-700/40 rounded-lg">
                  <p className="text-xs text-amber-400">Status: {result.raw.ItemStatus}</p>
                </div>
              )}

              {/* CTA */}
              <button
                type="button"
                onClick={handleAddToInventory}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Add to Inventory →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
