"use client";

import Link from "next/link";

export default function ShopFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-900">
              Policies
            </h4>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <Link href="#" className="transition-colors hover:text-slate-900">
                  Shipping Policy
                </Link>
              </li>
              <li>
                <Link href="#" className="transition-colors hover:text-slate-900">
                  Returns Policy
                </Link>
              </li>
              <li>
                <a
                  href="mailto:support@cardzcheck.com"
                  className="transition-colors hover:text-slate-900"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-900">
              Marketplace
            </h4>
            <p className="text-sm text-slate-600">
              Browse currently available listings and complete checkout in-app.
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-900">
              Main App
            </h4>
            <Link
              href="/"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              Main App →
            </Link>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-8 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} CardzCheck. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
