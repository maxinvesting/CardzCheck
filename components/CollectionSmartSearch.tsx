"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { searchPlayers, searchCardSets } from "@/lib/card-data";
import type { ParsedSearch, CollectionItem, Comp } from "@/types";
import type { SmartSearchCandidate, SmartSearchResult } from "@/lib/smartSearch";

interface CollectionSmartSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (playerName: string, item?: CollectionItem) => void;
  onLimitReached: () => void;
  initialQuery?: string;
}

type CollectionSearchResult = SmartSearchResult;

interface Suggestion {
  type: "player" | "set";
  value: string;
  label: string;
  metadata?: string;
}

export default function CollectionSmartSearch({
  isOpen,
  onClose,
  onSuccess,
  onLimitReached,
  initialQuery = "",
}: CollectionSmartSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<CollectionSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCloseMatches, setShowCloseMatches] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [addLoadingId, setAddLoadingId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local query in sync when modal opens with a new initialQuery
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery || "");
    }
  }, [isOpen, initialQuery]);

  // Generate suggestions from card database
  const updateSuggestions = useCallback(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const newSuggestions: Suggestion[] = [];

    // Player suggestions
    const players = searchPlayers(query);
    players.slice(0, 3).forEach((p) => {
      newSuggestions.push({
        type: "player",
        value: p.name,
        label: p.name,
        metadata: p.sport.charAt(0).toUpperCase() + p.sport.slice(1),
      });
    });

    // Set suggestions
    const sets = searchCardSets(query);
    sets.slice(0, 3).forEach((s) => {
      newSuggestions.push({
        type: "set",
        value: s.name,
        label: s.name,
        metadata: s.years,
      });
    });

    setSuggestions(newSuggestions);
  }, [query]);

  useEffect(() => {
    updateSuggestions();
  }, [updateSuggestions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const resetForm = () => {
    setQuery(initialQuery || "");
    setSearchResult(null);
    setError(null);
    setSearchLoading(false);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    setShowCloseMatches(false);
    setAddLoadingId(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSearch = async () => {
    if (!query.trim()) return;

    setError(null);
    setSearchResult(null);
    setShowCloseMatches(false);
    setSearchLoading(true);
    setShowSuggestions(false);

    try {
      const response = await fetch(`/api/collection/search?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Search failed");
      }

      if (!data.smartSearch) {
        throw new Error("Search did not return any smart matches. Try a more specific query.");
      }

      setSearchResult(data.smartSearch as CollectionSearchResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    if (query.trim()) {
      setQuery(`${query.trim()} ${suggestion.value}`);
    } else {
      setQuery(suggestion.value);
    }
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setShowSuggestions(true);
        setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length && showSuggestions) {
          e.preventDefault();
          handleSuggestionClick(suggestions[highlightedIndex]);
        } else {
          handleSearch();
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const buildNotes = (parsed: ParsedSearch, comp?: Comp | null): string | null => {
    const lines: string[] = [];
    const details: string[] = [];
    if (parsed.card_number) {
      details.push(
        `Card ${
          parsed.card_number.startsWith("#") ? parsed.card_number : `#${parsed.card_number}`
        }`
      );
    }
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

  const addCandidateToCollection = async (candidate: SmartSearchCandidate) => {
    if (!searchResult) return;

    const parsed: ParsedSearch = searchResult.parsed.original;
    const baseName = parsed.player_name?.trim() || query.trim();

    if (!baseName) {
      setError("Search first, then select a match.");
      return;
    }

    const comp = (candidate.raw as Comp | undefined) ?? null;

    const body = {
      player_name: baseName,
      year: parsed.year || candidate.year || null,
      set_name:
        parsed.set_name ||
        (candidate.brand && candidate.line
          ? `${candidate.brand} ${candidate.line}`
          : candidate.brand || candidate.line) ||
        null,
      grade: parsed.grade || null,
      purchase_price: comp?.price ?? null,
      purchase_date: comp?.date ?? null,
      image_url: comp?.image ?? null,
      notes: buildNotes(parsed, comp),
    };

    setError(null);
    setAddLoadingId(candidate.id);

    try {
      const response = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "limit_reached") {
          onLimitReached();
          handleClose();
          return;
        }
        throw new Error(data.error || "Failed to add card");
      }

      onSuccess(baseName, data.item ?? undefined);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add card");
    } finally {
      setAddLoadingId(null);
    }
  };

  const renderMismatchBadges = (candidate: SmartSearchCandidate) => {
    if (!searchResult) return null;
    const locked = searchResult.parsed.locked;
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

  const renderCandidate = (
    candidate: SmartSearchCandidate,
    index: number,
    bucket: "exact" | "close"
  ) => {
    const confidencePct =
      candidate.confidence !== undefined ? Math.round(candidate.confidence * 100) : null;
    const isExact = bucket === "exact";
    const isAdding = addLoadingId === candidate.id;

    return (
      <button
        key={candidate.id ?? `${bucket}-${index}`}
        type="button"
        onClick={() => addCandidateToCollection(candidate)}
        className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        disabled={!!addLoadingId}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
              {candidate.title}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {[
                candidate.year,
                candidate.brand && candidate.line
                  ? `${candidate.brand} ${candidate.line}`
                  : candidate.brand || candidate.line,
                candidate.cardNumber,
                candidate.parallel,
              ]
                .filter(Boolean)
                .join(" • ")}
            </p>
            {renderMismatchBadges(candidate)}
          </div>
          <div className="flex flex-col items-end gap-1">
            {confidencePct !== null && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {confidencePct}% match
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isExact ? "Exact" : "Close"}
            </span>
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
              {isAdding ? "Adding..." : "Add to collection"}
            </span>
          </div>
        </div>
      </button>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-20 pb-8">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-xl flex-shrink-0">
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

          {/* Search Input */}
          <div ref={wrapperRef} className="relative">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                  setHighlightedIndex(-1);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                placeholder='Search and add a card... (e.g., "Jordan 1986 PSA 10")'
                className="w-full pl-10 pr-20 py-3 text-sm border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500"
                autoComplete="off"
              />
              <button
                onClick={handleSearch}
                disabled={searchLoading || !query.trim()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {searchLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  "Search"
                )}
              </button>
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.type}-${suggestion.value}-${index}`}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className={`w-full px-3 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                      index === highlightedIndex ? "bg-gray-100 dark:bg-gray-700" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {suggestion.type === "player" && (
                        <svg
                          className="w-4 h-4 text-blue-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      )}
                      {suggestion.type === "set" && (
                        <svg
                          className="w-4 h-4 text-purple-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                          />
                        </svg>
                      )}
                      <span className="text-sm text-gray-900 dark:text-white">
                        {suggestion.label}
                      </span>
                    </div>
                    {suggestion.metadata && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {suggestion.metadata}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search Result */}
          {searchResult && (
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              {/* Exact matches */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Exact matches
                  </h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {searchResult.exact.length} found
                  </span>
                </div>

                {searchResult.exact.length === 0 ? (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-xs text-yellow-800 dark:text-yellow-300">
                      No exact matches found based on year/brand/set in your query.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchResult.exact.map((candidate, index) =>
                      renderCandidate(candidate, index, "exact")
                    )}
                  </div>
                )}
              </div>

              {/* Close matches */}
              {searchResult.close.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      Close matches
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowCloseMatches((prev) => !prev)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {showCloseMatches ? "Hide close matches" : "Show close matches"}
                    </button>
                  </div>
                  {showCloseMatches && (
                    <div className="space-y-2">
                      {searchResult.close.map((candidate, index) =>
                        renderCandidate(candidate, index, "close")
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

