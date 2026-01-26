"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { SearchFormData } from "@/types";
// Disabled smart search parsing to prevent autocorrect
// import { parseSmartSearch, parsedSearchToFormData } from "@/lib/smart-search-parser";
import { getTopRecentSearches } from "@/lib/recent-searches";
// Disabled autocomplete suggestions to prevent autocorrect
// import { searchPlayers, searchCardSets } from "@/lib/card-data";
import SearchForm from "./SearchForm";

interface SearchBarProps {
  initialData?: SearchFormData;
  onSearch: (data: SearchFormData) => void;
  loading?: boolean;
  disabled?: boolean;
  showAdvancedByDefault?: boolean;
  placeholder?: string;
}

interface Suggestion {
  type: "player" | "set" | "recent";
  value: string;
  label: string;
  metadata?: string;
  query?: string;
}

export default function SearchBar({
  initialData,
  onSearch,
  loading,
  disabled,
  showAdvancedByDefault = false,
  placeholder = "Search any card... (e.g., Jordan Fleer 1986 PSA 10)",
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  // Disabled parsing to prevent autocorrect
  // const [parsed, setParsed] = useState<ParsedSearch | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(showAdvancedByDefault);
  const [showDropdown, setShowDropdown] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [advancedData, setAdvancedData] = useState<SearchFormData | undefined>(initialData);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Update query from initialData (e.g., from card uploader)
  useEffect(() => {
    if (initialData?.player_name) {
      const parts = [
        initialData.player_name,
        initialData.year,
        initialData.set_name,
        initialData.grade,
        initialData.parallel_type,
      ].filter(Boolean);
      setQuery(parts.join(" "));
      setAdvancedData(initialData);
    }
  }, [initialData]);

  // Disabled parsing - use exact user input
  // useEffect(() => {
  //   if (debounceRef.current) {
  //     clearTimeout(debounceRef.current);
  //   }

  //   if (!query.trim()) {
  //     setParsed(null);
  //     return;
  //   }

  //   debounceRef.current = setTimeout(() => {
  //     const result = parseSmartSearch(query);
  //     setParsed(result);
  //   }, 300);

  //   return () => {
  //     if (debounceRef.current) {
  //       clearTimeout(debounceRef.current);
  //     }
  //   };
  // }, [query]);

  // Generate suggestions - DISABLED to prevent autocorrect
  const updateSuggestions = useCallback(() => {
    // Only show recent searches when query is empty - no autocomplete suggestions
    const newSuggestions: Suggestion[] = [];

    // Recent searches (only show when dropdown opens with empty query)
    if (query.length === 0) {
      const recent = getTopRecentSearches(5);
      recent.forEach((r) => {
        newSuggestions.push({
          type: "recent",
          value: r.query,
          label: r.query,
          query: r.query,
          metadata: r.resultCount ? `${r.resultCount} results` : undefined,
        });
      });
    }

    // Disabled autocomplete suggestions to prevent autocorrect
    // if (query.length >= 2) {
    //   // Player suggestions
    //   const players = searchPlayers(query);
    //   players.slice(0, 3).forEach((p) => {
    //     newSuggestions.push({
    //       type: "player",
    //       value: p.name,
    //       label: p.name,
    //       metadata: p.sport.charAt(0).toUpperCase() + p.sport.slice(1),
    //     });
    //   });

    //   // Set suggestions
    //   const sets = searchCardSets(query);
    //   sets.slice(0, 3).forEach((s) => {
    //     newSuggestions.push({
    //       type: "set",
    //       value: s.name,
    //       label: s.name,
    //       metadata: s.years,
    //     });
    //   });
    // }

    setSuggestions(newSuggestions);
  }, [query]);

  useEffect(() => {
    updateSuggestions();
    // Reset highlight when suggestions change to prevent stale selections
    setHighlightedIndex(-1);
  }, [updateSuggestions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    if (showAdvanced && advancedData) {
      onSearch(advancedData);
      return;
    }

    if (!query.trim()) return;

    // Use exact query as player name - no parsing/autocorrect
    const formData = { player_name: query.trim() };
    onSearch(formData);
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showAdvanced) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setShowDropdown(true);
        setHighlightedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        // Only allow selecting recent searches - no autocomplete replacement
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length && showDropdown) {
          const selected = suggestions[highlightedIndex];
          if (selected.type === "recent" && selected.query) {
            e.preventDefault();
            setQuery(selected.query);
            setShowDropdown(false);
            setHighlightedIndex(-1);
            // Don't auto-submit - let user press Enter again if they want to search
          } else {
            // Ignore autocomplete suggestions - just submit what user typed
            handleSubmit();
          }
        } else {
          // User pressed Enter without selecting a suggestion - search what they typed
          handleSubmit();
        }
        break;
      case "Escape":
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    // Only allow clicking recent searches - no autocomplete replacement
    if (suggestion.type === "recent" && suggestion.query) {
      setQuery(suggestion.query);
      setShowDropdown(false);
      setHighlightedIndex(-1);
      inputRef.current?.focus();
    }
    // Disabled autocomplete replacement to prevent autocorrect
    // else {
    //   // Append to existing query if there's already content
    //   if (query.trim()) {
    //     setQuery(`${query.trim()} ${suggestion.value}`);
    //   } else {
    //     setQuery(suggestion.value);
    //   }
    //   setShowDropdown(false);
    //   setHighlightedIndex(-1);
    //   inputRef.current?.focus();
    // }
  };

  const handleAdvancedSearch = (data: SearchFormData) => {
    setAdvancedData(data);
    onSearch(data);
  };

  const getTagColor = (type: string): string => {
    switch (type) {
      case "player":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "year":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "set":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "grade":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "parallel":
        return "bg-pink-500/20 text-pink-400 border-pink-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };

  return (
    <div ref={wrapperRef} className="w-full">
      {!showAdvanced && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg
                className="w-4 h-4 text-gray-500"
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
                setShowDropdown(true);
                setHighlightedIndex(-1); // Reset highlight when typing
              }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || loading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              className="w-full pl-10 pr-20 py-3 text-sm border border-gray-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 bg-gray-800/80 text-white placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            />
            <button
              type="submit"
              disabled={loading || disabled || !query.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all hover:shadow-lg hover:shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center gap-2"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                "Search"
              )}
            </button>
          </div>

          {/* Parsed tags - DISABLED to prevent autocorrect */}
          {/* {parsed && (parsed.player_name || parsed.year || parsed.set_name || parsed.grade) && (
            <div className="flex flex-wrap gap-2">
              {parsed.player_name && (
                <span className={`px-2 py-1 text-sm rounded-md border ${getTagColor("player")}`}>
                  {parsed.player_name}
                </span>
              )}
              {parsed.year && (
                <span className={`px-2 py-1 text-sm rounded-md border ${getTagColor("year")}`}>
                  {parsed.year}
                </span>
              )}
              {parsed.set_name && (
                <span className={`px-2 py-1 text-sm rounded-md border ${getTagColor("set")}`}>
                  {parsed.set_name}
                </span>
              )}
              {parsed.grade && (
                <span className={`px-2 py-1 text-sm rounded-md border ${getTagColor("grade")}`}>
                  {parsed.grade}
                </span>
              )}
              {parsed.parallel_type && (
                <span className={`px-2 py-1 text-sm rounded-md border ${getTagColor("parallel")}`}>
                  {parsed.parallel_type}
                </span>
              )}
            </div>
          )} */}

          {/* Suggestions dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-gray-800/95 backdrop-blur-sm border border-gray-700/50 rounded-xl shadow-xl shadow-black/20 max-h-64 overflow-y-auto">
              {query.length === 0 && suggestions.some((s) => s.type === "recent") && (
                <div className="px-3 py-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider border-b border-gray-700/50">
                  Recent
                </div>
              )}
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.type}-${suggestion.value}-${index}`}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/50 transition-colors flex items-center justify-between ${
                    index === highlightedIndex ? "bg-gray-700/50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {suggestion.type === "recent" && (
                      <svg
                        className="w-3.5 h-3.5 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    )}
                    {suggestion.type === "player" && (
                      <svg
                        className="w-3.5 h-3.5 text-blue-500"
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
                        className="w-3.5 h-3.5 text-purple-500"
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
                    <span className="text-sm text-white">{suggestion.label}</span>
                  </div>
                  {suggestion.metadata && (
                    <span className="text-[11px] text-gray-500">{suggestion.metadata}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </form>
      )}

      {/* Toggle advanced button */}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          disabled={disabled}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
        >
          <span>{showAdvanced ? "Simple search" : "Advanced filters"}</span>
          <svg
            className={`w-3 h-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Advanced form */}
      {showAdvanced && (
        <div className="mt-3 p-3 bg-gray-800/40 rounded-xl border border-white/5">
          <SearchForm
            initialData={advancedData || initialData}
            onSearch={handleAdvancedSearch}
            loading={loading}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
