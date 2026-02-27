"use client";

import Link from "next/link";

export default function ShopFooter() {
  return (
    <footer className="mt-20 border-t border-gray-800/80 bg-gray-900/20">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              Policies
            </h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <Link href="#" className="hover:text-gray-300 transition-colors">
                  Shipping Policy
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-gray-300 transition-colors">
                  Returns Policy
                </Link>
              </li>
              <li>
                <a href="mailto:support@cardzcheck.com" className="hover:text-gray-300 transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              CardzCheck
            </h4>
            <p className="text-sm text-gray-400">
              Powered by CardzCheck CMV – data-driven pricing from real comps.
            </p>
            <Link
              href="/comps"
              className="inline-block mt-3 px-4 py-2 rounded-lg bg-gray-800/80 text-gray-300 hover:text-white border border-gray-700/60 hover:border-gray-600 font-medium text-sm transition-colors"
            >
              Try Comps
            </Link>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
              Main App
            </h4>
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-white font-medium transition-colors"
            >
              Main App →
            </Link>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-800 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} CardzCheck. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
