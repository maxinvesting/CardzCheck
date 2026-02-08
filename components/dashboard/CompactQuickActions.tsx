"use client";

import Link from "next/link";

interface CompactQuickActionsProps {
  onAddCard?: () => void;
}

export default function CompactQuickActions({ onAddCard }: CompactQuickActionsProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-white mb-3">Quick Actions</h3>

      <div className="grid grid-cols-2 gap-2">
        {/* Add Card */}
        <button
          onClick={onAddCard}
          className="flex items-center gap-2 p-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-xs font-medium text-white">Add Card</span>
        </button>

        {/* Run Comps */}
        <Link
          href="/comps"
          className="flex items-center gap-2 p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-xs font-medium text-white">Run Comps</span>
        </Link>

        {/* View Collection */}
        <Link
          href="/collection"
          className="flex items-center gap-2 p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="text-xs font-medium text-white">Collection</span>
        </Link>

        {/* Export */}
        <Link
          href="/collection"
          className="flex items-center gap-2 p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span className="text-xs font-medium text-white">Export</span>
        </Link>
      </div>
    </div>
  );
}
