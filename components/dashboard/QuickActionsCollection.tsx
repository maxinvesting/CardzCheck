"use client";

import Link from "next/link";

interface QuickActionsCollectionProps {
  onAddCard?: () => void;
}

export default function QuickActionsCollection({
  onAddCard,
}: QuickActionsCollectionProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>

      <div className="space-y-2">
        {/* Add Card */}
        <button
          onClick={onAddCard}
          className="w-full flex items-center gap-3 p-3 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-left"
        >
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-white text-sm">Add Card</p>
            <p className="text-xs text-blue-200">Add to your collection</p>
          </div>
        </button>

        {/* Run Comps */}
        <Link
          href="/comps"
          className="w-full flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-white text-sm">Run Comps</p>
            <p className="text-xs text-gray-400">Search eBay sales data</p>
          </div>
        </Link>

        {/* View Collection */}
        <Link
          href="/collection"
          className="w-full flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-gray-300"
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
          </div>
          <div>
            <p className="font-medium text-white text-sm">View Collection</p>
            <p className="text-xs text-gray-400">Manage your cards</p>
          </div>
        </Link>

        {/* Export Collection */}
        <Link
          href="/collection"
          className="w-full flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-white text-sm">Export Collection</p>
            <p className="text-xs text-gray-400">Download as CSV</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
