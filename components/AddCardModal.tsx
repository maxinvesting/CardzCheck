"use client";

import { useMemo, useState, useEffect } from "react";
import type { Comp, ParsedSearch, CollectionItem } from "@/types";
import type { SmartSearchResult, SmartSearchCandidate } from "@/lib/smartSearch";

interface AddCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (playerName: string, item?: CollectionItem) => void;
  onLimitReached: () => void;
  initialQuery?: string;
  mode?: "collection" | "watchlist";
  onCardSelected?: (cardData: {
    player_name: string;
    year?: string;
    set_name?: string;
    card_number?: string;
    parallel_type?: string;
    grade?: string;
  }) => void;
}

type CollectionSearchResponse =
  | {
      comps: Comp[];
      stats: unknown;
      query: string;
      parsed: ParsedSearch;
      smartSearch?: SmartSearchResult;
    }
  | {
      error: string;
      message?: string;
      fallback_url?: string | null;
    };

export default function AddCardModal({
  isOpen,
  onClose,
  onSuccess,
  onLimitReached,
  initialQuery = "",
  mode = "collection",
  onCardSelected,
}: AddCardModalProps) {
  // UI state
  const [smartQuery, setSmartQuery] = useState(initialQuery);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addLoadingLink, setAddLoadingLink] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<{
    comps: Comp[];
    parsed: ParsedSearch;
    query: string;
    smartSearch?: SmartSearchResult;
  } | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setSmartQuery(initialQuery || "");
    setSearchResult(null);
    setFallbackUrl(null);
    setAddLoadingLink(null);
    setError(null);
  };

  // Update smartQuery when initialQuery changes
  useEffect(() => {
    if (isOpen && initialQuery) {
      setSmartQuery(initialQuery);
    }
  }, [isOpen, initialQuery]);

  const rankedComps = useMemo(() => {
    if (!searchResult?.smartSearch) return searchResult?.comps ?? [];
    const scoredIds = new Set<string>(
      [...searchResult.smartSearch.exact, ...searchResult.smartSearch.close].map((c) => c.id)
    );
    // Preserve original comps order for those not scored, append after
    const scoredFirst = searchResult.smartSearch.exact
      .concat(searchResult.smartSearch.close)
      .map((cand) => {
        const raw = cand.raw as Comp | undefined;
        return raw ?? null;
      })
      .filter((c): c is Comp => !!c);

    const remaining = (searchResult.comps ?? []).filter((c) => !scoredIds.has(c.link));
    return [...scoredFirst, ...remaining];
  }, [searchResult]);

  const smartSummary = useMemo(() => {
    if (!searchResult) return null;
    const p = searchResult.parsed;
    const parts = [
      p.player_name,
      p.year,
      p.set_name,
      p.grade,
      p.card_number,
      p.parallel_type,
      p.serial_number,
      p.variation,
      p.autograph,
      p.relic,
      p.unparsed_tokens?.length ? `Keywords: ${p.unparsed_tokens.join(" ")}` : null,
    ].filter(Boolean) as string[];
    return parts.length ? parts.join(" • ") : null;
  }, [searchResult]);

  const handleSmartSearch = async () => {
    setError(null);
    setFallbackUrl(null);
    setSearchResult(null);

    if (!smartQuery.trim()) return;

    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ q: smartQuery.trim() });
      const response = await fetch(`/api/collection/search?${params.toString()}`);

      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Search service temporarily unavailable. Please try again.");
      }

      const data: CollectionSearchResponse = await response.json();
      if (!response.ok) {
        throw new Error(("message" in data && data.message) || ("error" in data && data.error) || "Search failed");
      }

      if (!("comps" in data) || !("parsed" in data)) {
        throw new Error("Unexpected response from search service.");
      }

      setSearchResult({
        comps: data.comps || [],
        parsed: data.parsed,
        query: data.query,
        smartSearch: data.smartSearch,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const buildNotes = (parsed: ParsedSearch, comp?: Comp | null): string | null => {
    const lines: string[] = [];
    const details: string[] = [];
    if (parsed.card_number) details.push(`Card ${parsed.card_number.startsWith("#") ? parsed.card_number : `#${parsed.card_number}`}`);
    if (parsed.parallel_type) details.push(parsed.parallel_type);
    if (parsed.serial_number) details.push(parsed.serial_number);
    if (parsed.variation) details.push(parsed.variation);
    if (parsed.autograph) details.push(`Auto: ${parsed.autograph}`);
    if (parsed.relic) details.push(`Relic: ${parsed.relic}`);
    if (details.length) lines.push(details.join(" | "));

    if (parsed.unparsed_tokens?.length) {
      lines.push(`Keywords: ${parsed.unparsed_tokens.join(" ")}`);
    }

    if (comp) {
      lines.push(`Listing: ${comp.title}`);
      if (comp.link) lines.push(`Link: ${comp.link}`);
    }

    return lines.length ? lines.join("\n") : null;
  };

  const renderMismatchBadges = (candidate: SmartSearchCandidate) => {
    if (!searchResult?.smartSearch) return null;
    const locked = searchResult.smartSearch.parsed.locked;
    const mismatches = candidate.mismatchedConstraints || {};

    const badges: string[] = [];

    if (locked.year && mismatches.year) {
      badges.push("Year mismatch");
    }
    if (locked.brand && mismatches.brand) {
      badges.push(`Not ${locked.brand}`);
    }
    if (locked.line && mismatches.line) {
      badges.push(`Not ${locked.line}`);
    }

    if (!badges.length) return null;

    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {badges.map((badge) => (
          <span
            key={badge}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
          >
            {badge}
          </span>
        ))}
      </div>
    );
  };

  const addToCollectionFromComp = async (comp?: Comp | null) => {
    if (!searchResult?.parsed?.player_name?.trim()) {
      setError("Search first, then select a match.");
      return;
    }

    const parsed = searchResult.parsed;

    // If watchlist mode, call onCardSelected callback instead of adding to collection
    if (mode === "watchlist" && onCardSelected) {
      const cardData = {
        player_name: parsed.player_name,
        year: parsed.year || undefined,
        set_name: parsed.set_name || undefined,
        card_number: parsed.card_number || undefined,
        parallel_type: parsed.parallel_type || undefined,
        grade: parsed.grade || undefined,
      };
      console.log("🔍 AddCardModal: Watchlist mode - calling onCardSelected with:", cardData);
      onCardSelected(cardData);
      // Don't call onSuccess or close here - let WatchCardModal handle it
      return;
    }

    // Collection mode - add to collection
    const body = {
      player_name: parsed.player_name,
      year: parsed.year || null,
      set_name: parsed.set_name || null,
      grade: parsed.grade || null,
      purchase_price: comp?.price ?? null,
      purchase_date: comp?.date ?? null,
      image_url: comp?.image ?? null,
      notes: buildNotes(parsed, comp),
    };

    setError(null);
    setAddLoadingLink(comp?.link || "__manual__");
    try {
      console.log("🔍 AddCardModal: Collection mode - adding card with body:", body);
      const response = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      console.log("🔍 AddCardModal: Collection API response:", { ok: response.ok, data });
      if (!response.ok) {
        if (data.error === "limit_reached") {
          onLimitReached();
          onClose();
          return;
        }
        throw new Error(data.error || "Failed to add card");
      }

      console.log("✅ AddCardModal: Successfully added to collection");
      onSuccess(parsed.player_name, data.item ?? undefined);
      resetForm();
      onClose();
    } catch (err) {
      console.error("❌ AddCardModal: Error adding to collection:", err);
      setError(err instanceof Error ? err.message : "Failed to add card");
    } finally {
      setAddLoadingLink(null);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Add Card to Collection
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Smart Add (one-box internet search) */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Smart Add
            </h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={smartQuery}
                onChange={(e) => {
                  setSmartQuery(e.target.value);
                  setSearchResult(null);
                  setFallbackUrl(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setError(null);
                    handleSmartSearch();
                  }
                }}
                placeholder='e.g., "2024 Bo Nix Rated Rookie Prizm PSA 10 Silver /99"'
                className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => handleSmartSearch()}
                disabled={!smartQuery.trim()}
                className="px-4 py-2.5 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {searchLoading ? "Searching..." : "Search internet"}
              </button>
            </div>
            {smartSummary && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {smartSummary}
              </p>
            )}
            {fallbackUrl && (
              <div className="pt-1">
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-red-600 dark:text-red-300 underline"
                >
                  Open results on eBay
                </a>
              </div>
            )}
          </div>

          {/* Results */}
          {searchResult && (
            <div className="border-t border-gray-200 dark:border-gray-800 pt-4 space-y-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Matches
                </h3>
                {rankedComps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => addToCollectionFromComp(rankedComps[0] || null)}
                    disabled={addLoadingLink !== null}
                    className="px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    Add best match
                  </button>
                )}
              </div>

              {/* Primary Add Card Button - Add from search query, not a specific comp */}
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {mode === "watchlist" ? "Add to Watchlist" : "Add to Collection"}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {smartSummary || "Add this card based on your search"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addToCollectionFromComp(null)}
                    disabled={addLoadingLink !== null}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {addLoadingLink === "__manual__" ? "Adding..." : mode === "watchlist" ? "Add to Watchlist" : "Add Card"}
                  </button>
                </div>
              </div>

              {rankedComps.length === 0 ? (
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    No sold listings found. You can still add it without a listing.
                  </p>
                  <button
                    type="button"
                    onClick={() => addToCollectionFromComp(null)}
                    disabled={addLoadingLink !== null}
                    className="mt-3 w-full px-4 py-2.5 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    Add without listing
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Exact matches bucket (if available from smartSearch) */}
                  {searchResult.smartSearch && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Exact matches
                        </h4>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          {searchResult.smartSearch.exact.length} found
                        </span>
                      </div>
                      <div className="space-y-2">
                        {searchResult.smartSearch.exact.map((cand) => {
                          const comp = cand.raw as Comp | undefined;
                          if (!comp) return null;
                          const isAdding = addLoadingLink === comp.link;
                          const isBest = rankedComps[0]?.link === comp.link;
                          return (
                            <div
                              key={comp.link}
                              className={`flex items-center gap-3 p-3 rounded-xl border ${
                                isBest
                                  ? "border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-900/20"
                                  : "border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/40"
                              }`}
                            >
                              {comp.image ? (
                                <img
                                  src={comp.image}
                                  alt={comp.title}
                                  className="w-12 h-16 object-cover rounded-md bg-gray-200 dark:bg-gray-800"
                                />
                              ) : (
                                <div className="w-12 h-16 rounded-md bg-gray-200 dark:bg-gray-800" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {comp.title}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  ${comp.price.toFixed(2)} • {comp.date}
                                  {isBest ? " • Best match" : ""}
                                </p>
                                {renderMismatchBadges(cand)}
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={comp.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-gray-500 dark:text-gray-400 underline"
                                >
                                  View
                                </a>
                                <button
                                  type="button"
                                  onClick={() => addToCollectionFromComp(comp)}
                                  disabled={addLoadingLink !== null}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                >
                                  {isAdding ? "Adding..." : "Add"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Close matches bucket */}
                  {searchResult.smartSearch && searchResult.smartSearch.close.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                          Close matches
                        </h4>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          {searchResult.smartSearch.close.length} found
                        </span>
                      </div>
                      <div className="space-y-2">
                        {searchResult.smartSearch.close.map((cand) => {
                          const comp = cand.raw as Comp | undefined;
                          if (!comp) return null;
                          const isAdding = addLoadingLink === comp.link;
                          return (
                            <div
                              key={comp.link}
                              className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/40"
                            >
                              {comp.image ? (
                                <img
                                  src={comp.image}
                                  alt={comp.title}
                                  className="w-12 h-16 object-cover rounded-md bg-gray-200 dark:bg-gray-800"
                                />
                              ) : (
                                <div className="w-12 h-16 rounded-md bg-gray-200 dark:bg-gray-800" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {comp.title}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  ${comp.price.toFixed(2)} • {comp.date}
                                </p>
                                {renderMismatchBadges(cand)}
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={comp.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-gray-500 dark:text-gray-400 underline"
                                >
                                  View
                                </a>
                                <button
                                  type="button"
                                  onClick={() => addToCollectionFromComp(comp)}
                                  disabled={addLoadingLink !== null}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                >
                                  {isAdding ? "Adding..." : "Add"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Fallback list if smartSearch is unavailable */}
                  {!searchResult.smartSearch && (
                    <div className="space-y-2">
                      {rankedComps.slice(0, 12).map((comp, idx) => {
                        const isAdding = addLoadingLink === comp.link;
                        const isBest = idx === 0;
                        return (
                          <div
                            key={comp.link}
                            className={`flex items-center gap-3 p-3 rounded-xl border ${
                              isBest
                                ? "border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-900/20"
                                : "border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/40"
                            }`}
                          >
                            {comp.image ? (
                              <img
                                src={comp.image}
                                alt={comp.title}
                                className="w-12 h-16 object-cover rounded-md bg-gray-200 dark:bg-gray-800"
                              />
                            ) : (
                              <div className="w-12 h-16 rounded-md bg-gray-200 dark:bg-gray-800" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {comp.title}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                ${comp.price.toFixed(2)} • {comp.date}
                                {isBest ? " • Best match" : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <a
                                href={comp.link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-gray-500 dark:text-gray-400 underline"
                              >
                                View
                              </a>
                              <button
                                type="button"
                                onClick={() => addToCollectionFromComp(comp)}
                                disabled={addLoadingLink !== null}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                              >
                                {isAdding ? "Adding..." : "Add"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => addToCollectionFromComp(null)}
                    disabled={addLoadingLink !== null}
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
                  >
                    Add without listing
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                handleSmartSearch();
              }}
              disabled={!smartQuery.trim() || searchLoading}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {searchLoading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
