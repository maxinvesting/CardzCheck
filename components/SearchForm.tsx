"use client";

import { useState } from "react";
import type { SearchFormData } from "@/types";

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    onSearch({
      player_name: playerName.trim(),
      year: year.trim() || undefined,
      set_name: setName.trim() || undefined,
      grade: grade.trim() || undefined,
    });
  };

  // Update fields when initialData changes (from photo upload)
  if (initialData && initialData.player_name !== playerName) {
    setPlayerName(initialData.player_name);
    setYear(initialData.year || "");
    setSetName(initialData.set_name || "");
    setGrade(initialData.grade || "");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label
            htmlFor="playerName"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Player Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="playerName"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="e.g., Michael Jordan"
            required
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
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
          <label
            htmlFor="setName"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Set / Brand
          </label>
          <input
            type="text"
            id="setName"
            value={setName}
            onChange={(e) => setSetName(e.target.value)}
            placeholder="e.g., Fleer"
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="grade"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Grade
          </label>
          <input
            type="text"
            id="grade"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="e.g., PSA 10"
            disabled={disabled}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
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
