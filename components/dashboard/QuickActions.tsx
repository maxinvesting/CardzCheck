"use client";

import Link from "next/link";

export default function QuickActions() {
  return (
    <div className="bg-gray-800/40 rounded-xl border border-white/5 p-1.5">
      <div className="flex items-center gap-1">
        {/* Upload Photo */}
        <Link
          href="/comps?upload=true"
          className="flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg hover:bg-gray-700/50 transition-all duration-200 group"
        >
          <div className="p-2.5 bg-blue-500/15 rounded-xl group-hover:bg-blue-500/25 group-hover:scale-105 transition-all duration-200">
            <svg
              className="w-5 h-5 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <span className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors">
            Upload
          </span>
        </Link>

        {/* Divider */}
        <div className="w-px h-10 bg-gray-700/50" />

        {/* Search Cards */}
        <Link
          href="/comps"
          className="flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg hover:bg-gray-700/50 transition-all duration-200 group"
        >
          <div className="p-2.5 bg-blue-500/15 rounded-xl group-hover:bg-blue-500/25 group-hover:scale-105 transition-all duration-200">
            <svg
              className="w-5 h-5 text-blue-400"
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
          <span className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors">
            Search
          </span>
        </Link>

        {/* Divider */}
        <div className="w-px h-10 bg-gray-700/50" />

        {/* My Collection */}
        <Link
          href="/collection"
          className="flex-1 flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg hover:bg-gray-700/50 transition-all duration-200 group"
        >
          <div className="p-2.5 bg-blue-500/15 rounded-xl group-hover:bg-blue-500/25 group-hover:scale-105 transition-all duration-200">
            <svg
              className="w-5 h-5 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
          </div>
          <span className="text-xs font-medium text-gray-300 group-hover:text-white transition-colors">
            Collection
          </span>
        </Link>
      </div>
    </div>
  );
}
