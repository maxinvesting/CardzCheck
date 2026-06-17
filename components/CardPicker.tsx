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

  const fieldLabelCls =
    "mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]";
  const fieldCls =
    "w-full border border-[#343941] bg-[#0F1317] px-3 py-2 text-sm text-[#E6E8EB] placeholder-[#5A626E] focus:border-[#20B26B] focus:outline-none disabled:opacity-50";
  const typeaheadMenuCls =
    "absolute z-20 mt-1 max-h-56 w-full overflow-y-auto border border-[#343941] bg-[#0F1317] shadow-xl";
  const typeaheadItemCls =
    "w-full px-3 py-2 text-left text-sm text-[#E6E8EB] hover:bg-[#1A1F25]";
  const secondaryBtnCls =
    "inline-flex items-center border border-[#343941] px-3 py-1.5 text-[11px] font-semibold text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB] disabled:opacity-50";
  const accentBtnCls =
    "inline-flex items-center border border-[#20B26B] px-3 py-1.5 text-[11px] font-semibold text-[#20B26B] transition-colors hover:bg-[#20B26B]/10 disabled:opacity-50";

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#77808C]">{labelCopy}</p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className={fieldLabelCls}>
            Player <span className="text-[#E05C5C]">*</span>
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
              className={fieldCls}
            />
            {!disabled && playerOptions.length > 0 && !selectedPlayer && (
              <div className={typeaheadMenuCls}>
                {playerOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handlePlayerSelect(option)}
                    className={typeaheadItemCls}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className={fieldLabelCls}>
            Set <span className="text-[#E05C5C]">*</span>
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
              className={fieldCls}
            />
            {!disabled && setOptions.length > 0 && !selectedSet && (
              <div className={typeaheadMenuCls}>
                {setOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSetSelect(option)}
                    className={typeaheadItemCls}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className={fieldLabelCls}>Year</label>
          <input
            type="text"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              resetResults();
            }}
            placeholder="e.g., 1986"
            disabled={disabled}
            className={fieldCls}
          />
        </div>

        <div>
          <label className={fieldLabelCls}>Parallel</label>
          <input
            list="cardpicker-parallels"
            value={parallel}
            onChange={(e) => {
              setParallel(e.target.value);
              resetResults();
            }}
            placeholder="e.g., Silver Prizm"
            disabled={disabled}
            className={fieldCls}
          />
          <datalist id="cardpicker-parallels">
            {CARD_VARIANTS.map((variant) => (
              <option key={variant} value={variant} />
            ))}
          </datalist>
        </div>

        <div>
          <label className={fieldLabelCls}>Grader</label>
          <select
            value={grader}
            onChange={(e) => {
              setGrader(e.target.value);
              resetResults();
            }}
            disabled={disabled}
            className={fieldCls}
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
          <label className={fieldLabelCls}>Grade</label>
          <select
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              resetResults();
            }}
            disabled={disabled}
            className={fieldCls}
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
          <label className={fieldLabelCls}>Card #</label>
          <input
            type="text"
            value={cardNumber}
            onChange={(e) => {
              setCardNumber(e.target.value);
              resetResults();
            }}
            placeholder="e.g., 57"
            disabled={disabled}
            className={fieldCls}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => handleSearch()}
          disabled={!canSearch || disabled || loading}
          className="border border-[#20B26B] bg-[#20B26B] px-4 py-2 text-xs font-semibold text-[#07100B] transition-colors hover:bg-[#33C47C] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
        </button>
        {formattedGrade && (
          <span className="text-xs text-[#77808C]">
            Using grade filter: {formattedGrade}
          </span>
        )}
      </div>

      {searchError && (
        <div className="border border-[#723030] bg-[#2A1111] px-3 py-2 text-xs text-[#E05C5C]">
          {searchError}
        </div>
      )}

      {hasSearched && !loading && !searchError && results.length === 0 && (
        <div className="border border-[#24282D] bg-[#0F1317] p-3">
          <p className="text-sm font-medium text-[#E6E8EB]">
            No exact catalog match found.
          </p>
          <p className="mt-1 text-xs text-[#77808C]">
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
                className={secondaryBtnCls}
              >
                Relax filters
              </button>
            )}
            {allowManualEntry && (
              <button
                type="button"
                onClick={handleManualEntry}
                disabled={disabled}
                className={accentBtnCls}
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
            <div className="border border-[#5A4A1E] bg-[#241D0C] p-3">
              <p className="text-sm font-medium text-[#F0B429]">
                No exact catalog match found.
              </p>
              <p className="mt-1 text-xs text-[#C79A3A]">
                Try one of these close matches or add manually.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
              Candidates ({results.length})
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {(canRelaxResults || (hasOptionalFilters && !relaxOptional)) && (
                <button
                  type="button"
                  onClick={() => handleSearch({ relax: true })}
                  disabled={loading}
                  className={secondaryBtnCls}
                >
                  Relax filters
                </button>
              )}
              {allowManualEntry && (
                <button
                  type="button"
                  onClick={handleManualEntry}
                  disabled={disabled}
                  className={accentBtnCls}
                >
                  Add manually
                </button>
              )}
            </div>
          </div>

          {externalLookupUnavailable && (
            <p className="border border-[#24282D] bg-[#0F1317] px-3 py-2 text-xs text-[#77808C]">
              No catalog match found. External lookup unavailable.
            </p>
          )}

          <div className="space-y-3">
            {groupedResults.map((group) => (
              <div key={group.key} className="overflow-hidden border border-[#24282D]">
                <div className="bg-[#11161B] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#77808C]">
                  {group.key}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] divide-y divide-[#24282D] text-left text-xs">
                    <thead className="bg-[#0B0D0F]">
                      <tr className="text-[#77808C]">
                        <th className="px-2.5 py-1.5 font-semibold">Year</th>
                        <th className="px-2.5 py-1.5 font-semibold">Player</th>
                        <th className="px-2.5 py-1.5 font-semibold">Set</th>
                        <th className="px-2.5 py-1.5 font-semibold">Card #</th>
                        <th className="px-2.5 py-1.5 font-semibold">Parallel</th>
                        <th className="px-2.5 py-1.5 font-semibold">Grader</th>
                        <th className="px-2.5 py-1.5 font-semibold">Grade</th>
                        <th className="px-2.5 py-1.5 font-semibold">Confidence</th>
                        <th className="px-2.5 py-1.5 font-semibold">Reason</th>
                        <th className="px-2.5 py-1.5 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1A1F25]">
                      {group.cards.map((card) => (
                        <tr key={card.id} className="align-top text-[#B8C0CC]">
                          <td className="px-2.5 py-1.5">{card.year || "-"}</td>
                          <td className="px-2.5 py-1.5 font-medium text-[#E6E8EB]">
                            {card.player_name || "-"}
                          </td>
                          <td className="px-2.5 py-1.5">{card.set_name || "-"}</td>
                          <td className="px-2.5 py-1.5">{normalizeCardNumber(card.card_number) || "-"}</td>
                          <td className="px-2.5 py-1.5">{card.variant || "-"}</td>
                          <td className="px-2.5 py-1.5">{card.grader || "-"}</td>
                          <td className="px-2.5 py-1.5">{card.grade || "-"}</td>
                          <td className="px-2.5 py-1.5">
                            <span className="inline-flex border border-[#343941] px-2 py-0.5 font-semibold text-[#B8C0CC]">
                              {card.confidence || "Similar"}
                            </span>
                          </td>
                          <td className="px-2.5 py-1.5 max-w-[220px]">
                            <span>{card.reason || buildCardDisplayName(card)}</span>
                          </td>
                          <td className="px-2.5 py-1.5">
                            <button
                              type="button"
                              onClick={() => handleSelect(card)}
                              disabled={disabled}
                              className="whitespace-nowrap border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[11px] font-semibold text-[#07100B] transition-colors hover:bg-[#33C47C] disabled:opacity-50"
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
