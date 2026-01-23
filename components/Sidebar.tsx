"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types";

async function handleUpgrade() {
  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
    });

    const data = await response.json();

    if (data.url) {
      window.location.href = data.url;
    }
  } catch (error) {
    console.error("Checkout error:", error);
  }
}

export default function Sidebar() {
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [remainingSearches, setRemainingSearches] = useState<number | null>(
    null
  );
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) {
        const { data } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single();
        if (data) {
          setUser(data);
          if (!data.is_paid) {
            setRemainingSearches(3 - (data.free_searches_used || 0));
          }
        }
      }
    }
    loadUser();
  }, []);

  const navItems = [
    {
      name: "Search",
      href: "/search",
      icon: (
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
      ),
    },
    {
      name: "My Collection",
      href: "/collection",
      icon: (
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
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
      ),
    },
    {
      name: "Portfolio",
      href: "/portfolio",
      icon: (
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
            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          />
        </svg>
      ),
      isPro: true,
    },
    {
      name: "Settings",
      href: "/settings",
      icon: (
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
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-gray-900 border border-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full bg-[#0f1419] border-r border-gray-800 flex flex-col z-40 transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 w-64`}
      >
        {/* Logo */}
        <Link
          href="/search"
          className="p-6 border-b border-gray-800"
          onClick={() => setIsOpen(false)}
        >
          <div className="text-2xl font-bold text-white">
            Cardz<span className="text-blue-600">Check</span>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const isProFeature = item.isPro && user && !user.is_paid;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive(item.href)
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {item.icon}
                <span className="font-medium">{item.name}</span>
                {isProFeature && (
                  <svg
                    className="w-4 h-4 ml-auto"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-gray-800 space-y-4">
          {/* Usage indicator for free users */}
          {user && !user.is_paid && remainingSearches !== null && (
            <div className="px-4 py-3 bg-gray-800 rounded-lg">
              <div className="text-xs text-gray-400 mb-1">Free Plan</div>
              <div className="text-sm font-medium text-white">
                {remainingSearches} / 3 searches remaining
              </div>
            </div>
          )}

          {/* Account info */}
          {user && (
            <div className="px-4 py-3 bg-gray-800 rounded-lg">
              <div className="text-xs text-gray-400 mb-1">Signed in as</div>
              <div className="text-sm font-medium text-white truncate">
                {user.email}
              </div>
              {user.is_paid && (
                <div className="mt-2 inline-flex items-center px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded">
                  Pro Member
                </div>
              )}
            </div>
          )}

          {/* Upgrade button for free users */}
          {user && !user.is_paid && (
            <button
              onClick={() => {
                setIsOpen(false);
                handleUpgrade();
              }}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-center transition-colors"
            >
              Upgrade to Pro
            </button>
          )}
        </div>
      </div>
    </>
  );
}
