"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CARD_VARIANTS } from "@/lib/card-data";
import {
  buildCardDisplayName,
  formatGraderGrade,
  normalizeCardNumber,
} from "@/lib/cards/format";

export type CardPickerMode = "comps" | "collection" | "watchlist" | "dashboard";

export interface CardPickerSelection {
  id?: string;
  player_name: string;
  year?: string;
  brand?: string;
  set_name?: string;
  variant?: string;
  grader?: string;
  grade?: string;
  card_number?: string;
  image_url?: string;
  user_image_url?: string;
  quantity?: number;
}

interface TypeaheadOption {
  id: string;
  label: string;
}

interface CardSearchResult {
  id: string;
  year?: string | null;
  brand?: string | null;
  set_name?: string | null;
  player_name?: string | null;
  variant?: string | null;
  grader?: string | null;
  grade?: string | null;
  card_number?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  title?: string | null;
  source?: string | null;
  confidence?: "Exact" | "Strong" | "Similar" | "Risky";
  reason?: string | null;
  reasonCodes?: string[];
  rejectionReasons?: string[];
  matchPass?: number;
  groupKey?: string;
}

interface CardPickerProps {
  mode: CardPickerMode;
  onSelect: (card: CardPickerSelection) => void;
  disabled?: boolean;
  initialFilters?: {
    playerName?: string;
    setName?: string;
    year?: string;
    parallel?: string;
    grader?: string;
    grade?: string;
    cardNumber?: string;
  };
}

const GRADER_OPTIONS = ["PSA", "BGS", "SGC", "CGC", "Raw"];
const GRADE_OPTIONS = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6", "5", "4"];

const typeaheadOptions: RequestInit = {
  headers: { "Content-Type": "application/json" },
};

export default function CardPicker({
  mode,
  onSelect,
  disabled = false,
  initialFilters,
}: CardPickerProps) {
  const [playerQuery, setPlayerQuery] = useState("");
  const [setQuery, setSetQuery] = useState("");
  const [playerOptions, setPlayerOptions] = useState<TypeaheadOption[]>([]);
  const [setOptions, setSetOptions] = useState<TypeaheadOption[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<TypeaheadOption | null>(
    null
  );
  const [selectedSet, setSelectedSet] = useState<TypeaheadOption | null>(null);
  const [year, setYear] = useState("");
  const [parallel, setParallel] = useState("");
  const [grader, setGrader] = useState("");
  const [grade, setGrade] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<CardSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [relaxOptional, setRelaxOptional] = useState(false);
  const [canRelaxResults, setCanRelaxResults] = useState(false);
  const [externalLookupUnavailable, setExternalLookupUnavailable] = useState(false);
  const isDev = process.env.NODE_ENV !== "production";
  const initialKeyRef = useRef<string | null>(null);

  const playerAbort = useRef<AbortController | null>(null);
  const setAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!initialFilters) return;
    const nextKey = [
      initialFilters.playerName ?? "",
      initialFilters.setName ?? "",
      initialFilters.year ?? "",
      initialFilters.parallel ?? "",
      initialFilters.grader ?? "",
      initialFilters.grade ?? "",
      initialFilters.cardNumber ?? "",
    ].join("|");
    if (initialKeyRef.current === nextKey) return;
    initialKeyRef.current = nextKey;
    if (initialFilters.playerName) {
      setSelectedPlayer((prev) =>
        prev ?? { id: initialFilters.playerName!, label: initialFilters.playerName! }
      );
      setPlayerQuery((prev) => prev || initialFilters.playerName!);
    }
    if (initialFilters.setName) {
      setSelectedSet((prev) =>
        prev ?? { id: initialFilters.setName!, label: initialFilters.setName! }
      );
      setSetQuery((prev) => prev || initialFilters.setName!);
    }
    if (initialFilters.year) setYear((prev) => prev || initialFilters.year!);
    if (initialFilters.parallel) setParallel((prev) => prev || initialFilters.parallel!);
    if (initialFilters.grader) setGrader((prev) => prev || initialFilters.grader!);
    if (initialFilters.grade) setGrade((prev) => prev || initialFilters.grade!);
    if (initialFilters.cardNumber) setCardNumber((prev) => prev || initialFilters.cardNumber!);
  }, [
    initialFilters?.playerName,
    initialFilters?.setName,
    initialFilters?.year,
    initialFilters?.parallel,
    initialFilters?.grader,
    initialFilters?.grade,
    initialFilters?.cardNumber,
  ]);

  const hasOptionalFilters = Boolean(
    year || parallel || grader || grade || cardNumber
  );
  const allowManualEntry = mode === "collection" || mode === "watchlist";

  const formattedGrade = useMemo(
    () => formatGraderGrade(grader || undefined, grade || undefined),
    [grader, grade]
  );
  const hasExactResult = results.some((result) => result.confidence === "Exact");
  const groupedResults = useMemo(() => {
    const groups = new Map<string, CardSearchResult[]>();
    for (const result of results) {
      const key =
        result.groupKey ||
        [
          result.variant?.trim() || "Unknown parallel",
          formatGraderGrade(result.grader, result.grade) || "Any grade",
        ].join(" / ");
      const existing = groups.get(key) ?? [];
      existing.push(result);
      groups.set(key, existing);
    }
    return Array.from(groups.entries()).map(([key, cards]) => ({ key, cards }));
  }, [results]);

  const logDebug = (...args: unknown[]) => {
    if (isDev) {
      console.debug("[CardPicker]", ...args);
    }
  };

  const normalizeTypeaheadResults = (data: unknown): TypeaheadOption[] => {
    const raw = Array.isArray((data as any)?.results)
      ? (data as any).results
      : Array.isArray(data)
      ? data
      : [];
    return raw
      .map((item: any) => {
        if (typeof item === "string") return { id: item, label: item };
        if (item && typeof item === "object") {
          const label =
            typeof item.label === "string"
              ? item.label
              : typeof item.name === "string"
              ? item.name
              : "";
          const id = typeof item.id === "string" ? item.id : label;
          return label ? { id, label } : null;
        }
        return null;
      })
      .filter(Boolean) as TypeaheadOption[];
  };

  const fetchTypeahead = async (
    endpoint: string,
    query: string,
    signal: AbortSignal
  ) => {
    const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`, {
      ...typeaheadOptions,
      signal,
    });
    if (!res.ok) {
      logDebug("Typeahead failed", endpoint, res.status);
      throw new Error("Typeahead failed");
    }
    const data = await res.json();
    return normalizeTypeaheadResults(data);
  };

  useEffect(() => {
    if (playerAbort.current) playerAbort.current.abort();
    if (playerQuery.trim().length < 2) {
      setPlayerOptions([]);
      return;
    }

    const controller = new AbortController();
    playerAbort.current = controller;
    const timer = setTimeout(async () => {
      try {
        logDebug("Player query", playerQuery.trim());
        const options = await fetchTypeahead(
          "/api/typeahead/players",
          playerQuery.trim(),
          controller.signal
        );
        logDebug("Player options", options.length);
        if (!controller.signal.aborted) setPlayerOptions(options);
      } catch (err) {
        logDebug("Player typeahead error", err);
        if (!controller.signal.aborted) setPlayerOptions([]);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [playerQuery]);

  useEffect(() => {
    if (setAbort.current) setAbort.current.abort();
    if (setQuery.trim().length < 2) {
      setSetOptions([]);
      return;
    }

    const controller = new AbortController();
    setAbort.current = controller;
    const timer = setTimeout(async () => {
      try {
        logDebug("Set query", setQuery.trim());
        const options = await fetchTypeahead(
          "/api/typeahead/sets",
          setQuery.trim(),
          controller.signal
        );
        logDebug("Set options", options.length);
        if (!controller.signal.aborted) setSetOptions(options);
      } catch (err) {
        logDebug("Set typeahead error", err);
        if (!controller.signal.aborted) setSetOptions([]);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [setQuery]);

  const resetResults = () => {
    setResults([]);
    setSearchError(null);
    setHasSearched(false);
    setRelaxOptional(false);
    setCanRelaxResults(false);
    setExternalLookupUnavailable(false);
  };

  const resolvedPlayer = selectedPlayer?.id ?? playerQuery.trim();
  const resolvedSet = selectedSet?.id ?? setQuery.trim();
  const canSearch = Boolean(resolvedPlayer && resolvedSet);

  const handleSearch = async (options?: { relax?: boolean }) => {
    if (!resolvedPlayer || !resolvedSet) {
      setSearchError("Player and set are required.");
      return;
    }
    if (!selectedPlayer) {
      setSelectedPlayer({
        id: resolvedPlayer,
        label: playerQuery.trim() || resolvedPlayer,
      });
    }
    if (!selectedSet) {
      setSelectedSet({
        id: resolvedSet,
        label: setQuery.trim() || resolvedSet,
      });
    }
    const relax = options?.relax ?? relaxOptional;
    setRelaxOptional(relax);
    setLoading(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      logDebug("Search payload", {
        playerId: resolvedPlayer,
        setSlug: resolvedSet,
        year: year || undefined,
        parallel: parallel || undefined,
        grader: grader || undefined,
        grade: grade || undefined,
        cardNumber: cardNumber || undefined,
        relaxOptional: relax,
        limit: 25,
      });
      const response = await fetch("/api/cards/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: resolvedPlayer,
          setSlug: resolvedSet,
          year: year || undefined,
          parallel: parallel || undefined,
          grader: grader || undefined,
          grade: grade || undefined,
          cardNumber: cardNumber || undefined,
          relaxOptional: relax,
          limit: 25,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Card search failed");
      }

      const nextResults = (data.results || []) as CardSearchResult[];
      setResults(nextResults);
      setCanRelaxResults(Boolean(data.canRelax));
      setExternalLookupUnavailable(Boolean(data.externalLookupUnavailable));
      logDebug("Search response", {
        count: nextResults.length,
        relaxed: data.relaxed,
        canRelax: data.canRelax,
        sources: data.sources,
        diagnostics: data.diagnostics,
      });
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
      setCanRelaxResults(false);
      setExternalLookupUnavailable(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (card: CardSearchResult) => {
    if (!card.player_name) return;
    const resultParallel = card.variant?.trim();
    const resultGrader = card.grader?.trim();
    const resultGrade = card.grade?.trim();
    onSelect({
      id: card.id,
      player_name: card.player_name,
      year: card.year ?? undefined,
      brand: card.brand ?? undefined,
      set_name: card.set_name ?? undefined,
      variant: resultParallel || undefined,
      grader: resultGrader || undefined,
      grade: resultGrade || undefined,
      card_number: normalizeCardNumber(card.card_number ?? undefined),
      image_url: card.image_url ?? undefined,
      user_image_url: card.user_image_url ?? undefined,
    });
  };

  const handleManualEntry = () => {
    if (!resolvedPlayer || !resolvedSet) return;
    onSelect({
      player_name: playerQuery.trim() || resolvedPlayer,
      year: year.trim() || undefined,
      brand: undefined,
      set_name: setQuery.trim() || resolvedSet,
      variant: parallel.trim() || undefined,
      grader: grader.trim() || undefined,
      grade: grade.trim() || undefined,
      card_number: normalizeCardNumber(cardNumber || undefined),
    });
  };

  const handlePlayerSelect = (option: TypeaheadOption) => {
    setSelectedPlayer(option);
    setPlayerQuery(option.label);
    resetResults();
    logDebug("Player selected", option);
  };

  const handleSetSelect = (option: TypeaheadOption) => {
    setSelectedSet(option);
    setSetQuery(option.label);
    resetResults();
    logDebug("Set selected", option);
  };

  const labelCopy =
    mode === "watchlist"
      ? "Pick the card you want to watch"
      : mode === "collection"
      ? "Pick the exact card to add"
      : mode === "dashboard"
      ? "Pick a card to search pricing data"
      : "Pick a card to run a pricing search";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{labelCopy}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
            Player <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={playerQuery}
              onChange={(e) => {
                setPlayerQuery(e.target.value);
                setSelectedPlayer(null);
                resetResults();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="Start typing a player name"
              disabled={disabled}
              className="w-full px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
            {!disabled && playerOptions.length > 0 && !selectedPlayer && (
              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {playerOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handlePlayerSelect(option)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
            Set <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={setQuery}
              onChange={(e) => {
                setSetQuery(e.target.value);
                setSelectedSet(null);
                resetResults();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="Start typing a set name"
              disabled={disabled}
              className="w-full px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
            {!disabled && setOptions.length > 0 && !selectedSet && (
              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {setOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSetSelect(option)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
            Year
          </label>
          <input
            type="text"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              resetResults();
            }}
            placeholder="e.g., 1986"
            disabled={disabled}
            className="w-full px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
            Parallel
          </label>
          <input
            list="cardpicker-parallels"
            value={parallel}
            onChange={(e) => {
              setParallel(e.target.value);
              resetResults();
            }}
            placeholder="e.g., Silver Prizm"
            disabled={disabled}
            className="w-full px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          <datalist id="cardpicker-parallels">
            {CARD_VARIANTS.map((variant) => (
              <option key={variant} value={variant} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
            Grader
          </label>
          <select
            value={grader}
            onChange={(e) => {
              setGrader(e.target.value);
              resetResults();
            }}
            disabled={disabled}
            className="w-full px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          >
            <option value="">Any grader</option>
            {GRADER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
            Grade
          </label>
          <select
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              resetResults();
            }}
            disabled={disabled}
            className="w-full px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          >
            <option value="">Any grade</option>
            {GRADE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
            Card #
          </label>
          <input
            type="text"
            value={cardNumber}
            onChange={(e) => {
              setCardNumber(e.target.value);
              resetResults();
            }}
            placeholder="e.g., 57"
            disabled={disabled}
            className="w-full px-3 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => handleSearch()}
          disabled={!canSearch || disabled || loading}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {loading ? "Searching..." : "Search"}
        </button>
        {formattedGrade && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Using grade filter: {formattedGrade}
          </span>
        )}
      </div>

      {searchError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{searchError}</p>
        </div>
      )}

      {hasSearched && !loading && !searchError && results.length === 0 && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800 rounded-lg">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            No exact catalog match found.
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {externalLookupUnavailable
              ? "No catalog match found. External lookup unavailable."
              : "Try one of these close matches or add manually."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(canRelaxResults || (hasOptionalFilters && !relaxOptional)) && (
              <button
                type="button"
                onClick={() => handleSearch({ relax: true })}
                disabled={loading}
                className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
              >
                Relax filters
              </button>
            )}
            {allowManualEntry && (
              <button
                type="button"
                onClick={handleManualEntry}
                disabled={disabled}
                className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
              >
                Add manually anyway
              </button>
            )}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {!hasExactResult && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                No exact catalog match found.
              </p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                Try one of these close matches or add manually.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Candidates ({results.length})
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {(canRelaxResults || (hasOptionalFilters && !relaxOptional)) && (
                <button
                  type="button"
                  onClick={() => handleSearch({ relax: true })}
                  disabled={loading}
                  className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
                >
                  Relax filters
                </button>
              )}
              {allowManualEntry && (
                <button
                  type="button"
                  onClick={handleManualEntry}
                  disabled={disabled}
                  className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                >
                  Add manually
                </button>
              )}
            </div>
          </div>

          {externalLookupUnavailable && (
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-400">
              No catalog match found. External lookup unavailable.
            </p>
          )}

          <div className="space-y-3">
            {groupedResults.map((group) => (
              <div key={group.key} className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                  {group.key}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[880px] w-full divide-y divide-gray-200 text-left text-xs dark:divide-gray-800">
                    <thead className="bg-white dark:bg-gray-900">
                      <tr className="text-gray-500 dark:text-gray-400">
                        <th className="px-3 py-2 font-semibold">Year</th>
                        <th className="px-3 py-2 font-semibold">Player</th>
                        <th className="px-3 py-2 font-semibold">Set</th>
                        <th className="px-3 py-2 font-semibold">Card #</th>
                        <th className="px-3 py-2 font-semibold">Parallel</th>
                        <th className="px-3 py-2 font-semibold">Grader</th>
                        <th className="px-3 py-2 font-semibold">Grade</th>
                        <th className="px-3 py-2 font-semibold">Confidence</th>
                        <th className="px-3 py-2 font-semibold">Reason</th>
                        <th className="px-3 py-2 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {group.cards.map((card) => (
                        <tr key={card.id} className="align-top text-gray-700 dark:text-gray-300">
                          <td className="px-3 py-2">{card.year || "-"}</td>
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                            {card.player_name || "-"}
                          </td>
                          <td className="px-3 py-2">{card.set_name || "-"}</td>
                          <td className="px-3 py-2">{normalizeCardNumber(card.card_number) || "-"}</td>
                          <td className="px-3 py-2">{card.variant || "-"}</td>
                          <td className="px-3 py-2">{card.grader || "-"}</td>
                          <td className="px-3 py-2">{card.grade || "-"}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex rounded-full border border-gray-200 px-2 py-0.5 font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-300">
                              {card.confidence || "Similar"}
                            </span>
                          </td>
                          <td className="px-3 py-2 max-w-[220px]">
                            <span>{card.reason || buildCardDisplayName(card)}</span>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => handleSelect(card)}
                              disabled={disabled}
                              className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                            >
                              Use this match
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
