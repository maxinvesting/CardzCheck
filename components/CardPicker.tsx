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
  id: string;
  player_name: string;
  year?: string;
  brand?: string;
  set_name?: string;
  variant?: string;
  grader?: string;
  grade?: string;
  card_number?: string;
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

  const formattedGrade = useMemo(
    () => formatGraderGrade(grader || undefined, grade || undefined),
    [grader, grade]
  );

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

      setResults((data.results || []) as CardSearchResult[]);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (card: CardSearchResult) => {
    if (!card.player_name) return;
    onSelect({
      id: card.id,
      player_name: card.player_name,
      year: card.year ?? undefined,
      brand: card.brand ?? undefined,
      set_name: card.set_name ?? undefined,
      variant: card.variant ?? undefined,
      grader: card.grader ?? undefined,
      grade: card.grade ?? undefined,
      card_number: normalizeCardNumber(card.card_number ?? undefined),
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
      ? "Pick a card to search comps"
      : "Pick a card to run comps";

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

      {hasSearched && hasOptionalFilters && results.length === 0 && !relaxOptional && (
        <button
          type="button"
          onClick={() => handleSearch({ relax: true })}
          disabled={loading}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Relax optional filters
        </button>
      )}

      {searchError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{searchError}</p>
        </div>
      )}

      {hasSearched && !loading && !searchError && results.length === 0 && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800 rounded-lg">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No results found. Try adjusting your filters.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Results ({results.length})
          </p>
          <div className="space-y-2">
            {results.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => handleSelect(card)}
                disabled={disabled}
                className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {buildCardDisplayName(card)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {[card.year, card.set_name, card.variant, formatGraderGrade(card.grader, card.grade)]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
