"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types";
import { LIMITS } from "@/types";
import { isTestMode, getTestUser } from "@/lib/test-mode";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadUser() {
      // In test mode, use mock user
      if (isTestMode()) {
        setUser(getTestUser());
        setAuthLoading(false);
        console.log("🧪 TEST MODE: Using mock user in Header");
        return;
      }

      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (authUser) {
        const { data } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single();

        if (data) {
          setUser(data);
        }
      }
      setAuthLoading(false);
    }

    loadUser();

    // Close dropdowns when clicking outside
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowSearchDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const handleUpgrade = async () => {
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
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/comps?player=${encodeURIComponent(searchQuery.trim())}`);
    setSearchQuery("");
    setShowSearchDropdown(false);
  };

  const remainingSearches = user
    ? user.is_paid
      ? null
      : Math.max(0, LIMITS.FREE_SEARCHES - user.free_searches_used)
    : null;

  // Get user initials for avatar
  const userInitials = user?.email
    ? user.email
        .split("@")[0]
        .substring(0, 2)
        .toUpperCase()
    : "U";

  return (
    <header className="bg-[#0f1419] dark:bg-[#0f1419] border-b border-gray-800">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href={user ? "/dashboard" : "/"} className="flex-shrink-0">
          <span className="text-xl md:text-2xl font-bold text-white tracking-tight">
            CardzCheck
          </span>
        </Link>

        {/* Search Bar - Always visible for authenticated users */}
        {user && (
          <div ref={searchRef} className="flex-1 max-w-md hidden sm:block">
            <form onSubmit={handleSearch} className="relative">
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
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowSearchDropdown(true)}
                placeholder="Search any card..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 bg-gray-800 text-white placeholder-gray-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded transition-colors"
                >
                  Search
                </button>
              )}
            </form>
            {/* Advanced search link */}
            {showSearchDropdown && (
              <div className="absolute mt-1 bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl p-2 z-50">
                <Link
                  href="/comps"
                  onClick={() => setShowSearchDropdown(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                    />
                  </svg>
                  Advanced filters
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Right nav */}
        <nav className="flex items-center gap-3">
          {authLoading ? (
            <div className="w-20 h-8 bg-gray-700 rounded animate-pulse" />
          ) : user ? (
            <>
              {/* Search Counter for Free Users */}
              {remainingSearches !== null && (
                <span className="text-xs text-gray-400 hidden md:block">
                  {remainingSearches}/{LIMITS.FREE_SEARCHES} searches
                </span>
              )}

              {/* Navigation Links */}
              <Link
                href="/collection"
                className={`text-sm hidden md:block ${
                  pathname === "/collection"
                    ? "text-blue-400 font-medium"
                    : "text-gray-300 hover:text-white"
                }`}
              >
                Collection
              </Link>

              {/* User Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                    {userInitials}
                  </div>
                  {user.is_paid && (
                    <span className="text-xs px-1.5 py-0.5 bg-green-900/30 text-green-400 rounded-full font-medium hidden sm:block">
                      Pro
                    </span>
                  )}
                  <svg
                    className={`w-4 h-4 text-gray-300 transition-transform ${
                      showDropdown ? "rotate-180" : ""
                    }`}
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

                {showDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-lg py-2 z-50">
                    {/* Plan Status */}
                    <div className="px-4 py-3 border-b border-gray-700">
                      <p className="text-xs text-gray-400 mb-1">
                        Plan
                      </p>
                      <p className="text-sm font-medium text-white">
                        {user.is_paid ? "Pro" : "Free"}
                      </p>
                    </div>

                    {/* Upgrade Option (if Free) */}
                    {!user.is_paid && (
                      <button
                        onClick={() => {
                          handleUpgrade();
                          setShowDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-blue-400 hover:bg-gray-800"
                      >
                        Upgrade to Pro
                      </button>
                    )}

                    {/* Settings */}
                    <Link
                      href="/account"
                      onClick={() => setShowDropdown(false)}
                      className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
                    >
                      Settings
                    </Link>

                    {/* Logout */}
                    <button
                      onClick={() => {
                        handleLogout();
                        setShowDropdown(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-800"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-gray-300 hover:text-white"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
