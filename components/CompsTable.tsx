"use client";

import { useState } from "react";
import type { Comp, SearchFormData } from "@/types";

interface CompsTableProps {
  comps: Comp[];
  onAddToCollection?: (comp: Comp) => void;
  canAddToCollection?: boolean;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type SortField = "price" | "date";
type SortDirection = "asc" | "desc";

export default function CompsTable({ comps, onAddToCollection, canAddToCollection = true }: CompsTableProps) {
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedComps = [...comps].sort((a, b) => {
    let comparison = 0;
    if (sortField === "price") {
      comparison = a.price - b.price;
    } else {
      comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className="ml-1 inline-flex flex-col">
      <svg
        className={`w-3 h-3 ${sortField === field && sortDirection === "asc" ? "text-blue-600" : "text-gray-400"}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M5 12l5-5 5 5H5z" />
      </svg>
      <svg
        className={`w-3 h-3 -mt-1 ${sortField === field && sortDirection === "desc" ? "text-blue-600" : "text-gray-400"}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M5 8l5 5 5-5H5z" />
      </svg>
    </span>
  );

  if (comps.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Card
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300"
                onClick={() => handleSort("price")}
              >
                <span className="flex items-center">
                  Price
                  <SortIcon field="price" />
                </span>
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-300"
                onClick={() => handleSort("date")}
              >
                <span className="flex items-center">
                  Sold
                  <SortIcon field="date" />
                </span>
              </th>
              {onAddToCollection && (
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Action
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {sortedComps.map((comp, index) => (
              <tr
                key={index}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <a
                    href={comp.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 group"
                  >
                    {comp.image && (
                      <img
                        src={comp.image}
                        alt=""
                        className="w-12 h-12 object-cover rounded-lg"
                        loading="lazy"
                      />
                    )}
                    <span className="text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2">
                      {comp.title}
                    </span>
                  </a>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatPrice(comp.price)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDate(comp.date)}
                  </span>
                </td>
                {onAddToCollection && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onAddToCollection(comp)}
                      disabled={!canAddToCollection}
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      + Add
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
