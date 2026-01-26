"use client";

import { useState, useEffect, useCallback } from "react";
import type { SearchFormData } from "@/types";
import Autocomplete from "./Autocomplete";
import { searchPlayers, searchCardSets, GRADING_OPTIONS } from "@/lib/card-data";

interface SearchFormProps {
  initialData?: SearchFormData;
  onSearch: (data: SearchFormData) => void;
  loading?: boolean;
  disabled?: boolean;
}

export default function SearchForm({ initialData, onSearch, loading, disabled }: SearchFormProps) {
  const [playerName, setPlayerName] = useState(initialData?.player_name || "");
  const [year, setYear] = useState(initialData?.year || "");
  const [setName, setSetName] = useState(initialData?.set_name || "");
  const [grade, setGrade] = useState(initialData?.grade || "");
  const [cardNumber, setCardNumber] = useState(initialData?.card_number || "");
  const [parallelType, setParallelType] = useState(initialData?.parallel_type || "");
  const [serialNumber, setSerialNumber] = useState(initialData?.serial_number || "");
  const [variation, setVariation] = useState(initialData?.variation || "");
  const [autograph, setAutograph] = useState(initialData?.autograph || "");
  const [relic, setRelic] = useState(initialData?.relic || "");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    onSearch({
      player_name: playerName.trim(),
      year: year.trim() || undefined,
      set_name: setName.trim() || undefined,
      grade: grade.trim() || undefined,
      card_number: cardNumber.trim() || undefined,
      parallel_type: parallelType.trim() || undefined,
      serial_number: serialNumber.trim() || undefined,
      variation: variation.trim() || undefined,
      autograph: autograph.trim() || undefined,
      relic: relic.trim() || undefined,
    });
  };

  // Memoize search callbacks to prevent infinite loops
  const handlePlayerSearch = useCallback((query: string) => {
    const players = searchPlayers(query);
    return players.map(p => ({
      value: p.name,
      label: p.name,
      metadata: p.sport.charAt(0).toUpperCase() + p.sport.slice(1)
    }));
  }, []);

  const handleSetSearch = useCallback((query: string) => {
    const sets = searchCardSets(query);
    return sets.map(s => ({
      value: s.name,
      label: s.name,
      metadata: s.years
    }));
  }, []);

  // Update fields when initialData changes (from photo upload)
  useEffect(() => {
    if (initialData) {
      setPlayerName(initialData.player_name || "");
      setYear(initialData.year || "");
      setSetName(initialData.set_name || "");
      setGrade(initialData.grade || "");
      setCardNumber(initialData.card_number || "");
      setParallelType(initialData.parallel_type || "");
      setSerialNumber(initialData.serial_number || "");
      setVariation(initialData.variation || "");
      setAutograph(initialData.autograph || "");
      setRelic(initialData.relic || "");
    }
  }, [initialData]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Autocomplete
            id="playerName"
            value={playerName}
            onChange={setPlayerName}
            onSearch={handlePlayerSearch}
            placeholder="e.g., Michael Jordan"
            label="Player Name"
            required
            disabled={disabled}
          />
        </div>

        <div>
          <label
            htmlFor="year"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Year
          </label>
          <input
            type="text"
            id="year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="e.g., 1986"
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <div>
          <Autocomplete
            id="setName"
            value={setName}
            onChange={setSetName}
            onSearch={handleSetSearch}
            placeholder="e.g., Panini Prizm"
            label="Set / Brand"
            disabled={disabled}
          />
        </div>

        <div className="md:col-span-2">
          <Autocomplete
            id="grade"
            value={grade}
            onChange={setGrade}
            options={GRADING_OPTIONS}
            placeholder="e.g., PSA 10"
            label="Grade"
            disabled={disabled}
          />
        </div>
      </div>

      {/* Advanced Options */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center justify-between w-full text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          disabled={disabled}
        >
          <span>Advanced Options</span>
          <svg
            className={`w-5 h-5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
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

        {showAdvanced && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="cardNumber"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Card Number
              </label>
              <input
                type="text"
                id="cardNumber"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="e.g., #100, #SP-1"
                disabled={disabled}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label
                htmlFor="parallelType"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Parallel / Refractor Type
              </label>
              <input
                type="text"
                id="parallelType"
                value={parallelType}
                onChange={(e) => setParallelType(e.target.value)}
                placeholder="e.g., Gold Prizm, Hyper Prizm, Black Velocity"
                disabled={disabled}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label
                htmlFor="serialNumber"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Serial Number
              </label>
              <input
                type="text"
                id="serialNumber"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="e.g., /25, /99, /299"
                disabled={disabled}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label
                htmlFor="variation"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Variation / Short Print
              </label>
              <input
                type="text"
                id="variation"
                value={variation}
                onChange={(e) => setVariation(e.target.value)}
                placeholder="e.g., Photo Variation, SSP, Image Variation"
                disabled={disabled}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label
                htmlFor="autograph"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Autograph Status
              </label>
              <input
                type="text"
                id="autograph"
                value={autograph}
                onChange={(e) => setAutograph(e.target.value)}
                placeholder="e.g., On-card auto, Sticker auto, Auto"
                disabled={disabled}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label
                htmlFor="relic"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Relic / Memorabilia
              </label>
              <input
                type="text"
                id="relic"
                value={relic}
                onChange={(e) => setRelic(e.target.value)}
                placeholder="e.g., Player-worn, Game-used, Patch"
                disabled={disabled}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || disabled || !playerName.trim()}
        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Searching...
          </>
        ) : (
          <>
            <svg
              className="w-5 h-5"
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
            Search eBay Sold
          </>
        )}
      </button>
    </form>
  );
}
