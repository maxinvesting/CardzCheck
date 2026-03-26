"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@/types";
import PricingModal from "@/components/PricingModal";
import { getCurrentUserCached } from "@/lib/current-user-client";

type NavItem = {
  name: string;
  href: string;
  icon: ReactNode;
  badge?: string;
  isPro?: boolean;
  exact?: boolean;
};

function HomeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
}

function CollectionIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  );
}

function BadgeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
      />
    </svg>
  );
}

function AnalystIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
      />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  );
}

function LedgerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  );
}

function BulkIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 11H5m14 0a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  );
}

function NewsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
      />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PERSONAL_NAV_ITEMS(): NavItem[] {
  return [
    { name: "Dashboard", href: "/dashboard", icon: <HomeIcon />, exact: true },
    { name: "Collection", href: "/collection", icon: <CollectionIcon /> },
    { name: "Grade Probability Engine", href: "/grade-hub", icon: <BadgeIcon />, badge: "Featured" },
    { name: "News & Updates", href: "/news", icon: <NewsIcon />, badge: "New" },
    { name: "Bulk Mode", href: "/bulk", icon: <BulkIcon /> },
    { name: "Watchlist", href: "/watchlist", icon: <EyeIcon />, isPro: true, badge: "Pro" },
    { name: "Compare Listings", href: "/comps", icon: <ChartIcon />, badge: "Beta" },
    { name: "CardzCheck Analyst", href: "/analyst", icon: <AnalystIcon />, isPro: true, badge: "Pro" },
    { name: "Marketplace", href: "/shop", icon: <ShopIcon /> },
    { name: "Help & FAQ", href: "/help", icon: <HelpIcon /> },
    { name: "Settings", href: "/settings", icon: <SettingsIcon /> },
  ];
}

function MessagesIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
      />
    </svg>
  );
}

function BUSINESS_NAV_ITEMS(): NavItem[] {
  return [
    { name: "Dashboard", href: "/business", icon: <HomeIcon />, exact: true },
    { name: "Ledger", href: "/business/ledger", icon: <LedgerIcon /> },
    { name: "Customer Service", href: "/business/messages", icon: <MessagesIcon />, badge: "New" },
    { name: "Grade Probability Engine", href: "/grade-hub", icon: <BadgeIcon />, badge: "Featured" },
    { name: "News & Updates", href: "/business/news", icon: <NewsIcon />, badge: "New" },
    { name: "Compare Listings", href: "/business/comps", icon: <ChartIcon />, badge: "Beta" },
    { name: "Business Consultant", href: "/business/consultant", icon: <AnalystIcon /> },
    { name: "Marketplace", href: "/shop", icon: <ShopIcon /> },
    { name: "Help & FAQ", href: "/help", icon: <HelpIcon /> },
    { name: "Settings", href: "/business/settings", icon: <SettingsIcon /> },
  ];
}

export default function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [remainingSearches, setRemainingSearches] = useState<number | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);

  const isBusinessWorkspace = pathname.startsWith("/business") || pathname.startsWith("/grade-hub") || pathname.startsWith("/bulk");
  const isAdminUser = user?.app_role === "admin" || user?.app_role === "owner";
  const hasPaidWorkspace = Boolean(user?.is_paid) || isBusinessWorkspace;
  const baseNavItems = isBusinessWorkspace ? BUSINESS_NAV_ITEMS() : PERSONAL_NAV_ITEMS();
  const navItems: NavItem[] = isAdminUser
    ? [
        ...baseNavItems,
        { name: "Admin", href: "/admin", icon: <AdminIcon />, badge: "Admin" },
      ]
    : baseNavItems;
  const businessSurfaceClass = "bg-[var(--biz-surface)] border-[color:var(--biz-border)]";

  useEffect(() => {
    async function loadUser() {
      const currentUser = await getCurrentUserCached();
      if (!currentUser) {
        setUser(null);
        setRemainingSearches(null);
        return;
      }

      setUser(currentUser);
      if (!currentUser.is_paid) {
        setRemainingSearches(3 - (currentUser.free_searches_used || 0));
      } else {
        setRemainingSearches(null);
      }
    }

    loadUser();
  }, []);

  const isActive = (item: NavItem): boolean => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`lg:hidden fixed top-4 left-4 z-50 rounded-lg border p-2 transition-colors ${
          isBusinessWorkspace
            ? `${businessSurfaceClass} text-[var(--biz-muted)] hover:text-[var(--biz-text)]`
            : "bg-gray-900 border-gray-800 text-gray-400 hover:text-white"
        }`}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        className={`fixed top-0 left-0 z-40 flex h-full w-64 flex-col border-r transition-transform duration-300 ${
          isBusinessWorkspace
            ? businessSurfaceClass
            : "bg-[#0f1419] border-gray-800"
        } ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${!isOpen ? "pointer-events-none lg:pointer-events-auto" : ""}`}
      >
        <Link
          href={isBusinessWorkspace ? "/business" : "/dashboard"}
          className={`flex cursor-pointer flex-col items-center justify-center border-b p-6 transition-opacity hover:opacity-90 ${
            isBusinessWorkspace ? "border-[color:var(--biz-border)]" : "border-gray-800"
          }`}
          onClick={() => setIsOpen(false)}
        >
          <span className={`text-2xl font-bold tracking-tight ${isBusinessWorkspace ? "text-[var(--biz-text)]" : "text-white"}`}>
            CardzCheck
          </span>
          {isBusinessWorkspace && (
            <span className="mt-1 rounded border border-[color:var(--biz-border)] bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-semibold text-[var(--biz-primary)]">
              Business
            </span>
          )}
        </Link>

        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          {navItems.map((item) => {
            const isProFeature = Boolean(item.isPro && user && !user.is_paid);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive(item)
                    ? item.href.includes("/shop")
                      ? "bg-cyan-600 text-white"
                      : isBusinessWorkspace
                      ? "border border-[color:var(--biz-border)] border-l-2 border-l-[var(--biz-primary)] bg-[#F3F4F6] text-[var(--biz-text)]"
                      : "bg-blue-600 text-white"
                    : isBusinessWorkspace
                      ? "text-[var(--biz-muted)] hover:bg-[#F9FAFB] hover:text-[var(--biz-text)]"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {item.icon}
                <span className="font-medium">{item.name}</span>
                {item.badge && !isProFeature && (
                  <span className={`ml-auto px-1.5 py-0.5 text-xs font-medium rounded ${
                    item.badge === "Featured"
                      ? isBusinessWorkspace
                        ? "border border-amber-200 bg-amber-50 text-[var(--biz-warning)]"
                        : "bg-blue-500/20 text-blue-400"
                      : isBusinessWorkspace
                        ? "border border-[color:var(--biz-border)] text-[var(--biz-muted)]"
                        : "bg-blue-500/20 text-blue-400"
                  }`}>
                    {item.badge}
                  </span>
                )}
                {isProFeature && (
                  <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
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

          {user && (user.app_role === "admin" || user.app_role === "owner") && (
            <>
              <div className={`pt-3 pb-1 px-4 text-[10px] font-semibold uppercase tracking-widest ${
                isBusinessWorkspace ? "text-[var(--biz-muted)]" : "text-gray-600"
              }`}>
                Admin
              </div>
              {[
                { name: "Marketplace", href: "/admin/shop", icon: <ShopIcon /> },
                { name: "News", href: "/admin/news", icon: <NewsIcon /> },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    pathname === item.href || pathname.startsWith(`${item.href}/`)
                      ? isBusinessWorkspace
                        ? "border border-orange-200 border-l-2 border-l-orange-500 bg-orange-50 text-orange-700"
                        : "bg-orange-600 text-white"
                      : isBusinessWorkspace
                        ? "text-[var(--biz-muted)] hover:bg-[#F9FAFB] hover:text-[var(--biz-text)]"
                        : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  {item.icon}
                  <span className="font-medium">{item.name}</span>
                  <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                    isBusinessWorkspace
                      ? "bg-orange-50 border border-orange-200 text-orange-600"
                      : "bg-orange-500/20 text-orange-400"
                  }`}>
                    Admin
                  </span>
                </Link>
              ))}
            </>
          )}
        </nav>

        <div
          className={`space-y-4 border-t p-4 ${
            isBusinessWorkspace ? "border-[color:var(--biz-border)]" : "border-gray-800"
          }`}
        >
          {user && !hasPaidWorkspace && remainingSearches !== null && (
            <div className={`rounded-lg px-4 py-3 ${isBusinessWorkspace ? "cc-surface" : "bg-gray-800"}`}>
              <div className="mb-1 text-xs text-[var(--biz-muted)]">Free Plan</div>
              <div className={`text-sm font-medium ${isBusinessWorkspace ? "text-[var(--biz-text)]" : "text-white"}`}>
                {remainingSearches} / 3 searches remaining
              </div>
            </div>
          )}

          {user && (
            <div className={`rounded-lg px-4 py-3 ${isBusinessWorkspace ? "cc-surface" : "bg-gray-800"}`}>
              <div className="mb-1 text-xs text-[var(--biz-muted)]">Signed in as</div>
              <div className={`truncate text-sm font-medium ${isBusinessWorkspace ? "text-[var(--biz-text)]" : "text-white"}`}>
                {user.email}
              </div>
              {hasPaidWorkspace && (
                <div
                  className={`mt-2 inline-flex items-center rounded px-2 py-1 text-xs font-medium ${
                    isBusinessWorkspace
                      ? "border border-[color:var(--biz-border)] bg-[#F0FDF4] text-[var(--biz-primary)]"
                      : "bg-blue-600 text-white"
                  }`}
                >
                  {isBusinessWorkspace ? "Business Workspace" : "Pro Member"}
                </div>
              )}
            </div>
          )}

          {user && !hasPaidWorkspace && (
            <button
              onClick={() => {
                setIsOpen(false);
                setPricingOpen(true);
              }}
              className={`w-full rounded-lg px-4 py-3 text-center font-medium transition-colors ${
                isBusinessWorkspace ? "cc-btn-primary" : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              Upgrade
            </button>
          )}

          <div className={`flex items-center justify-center gap-4 pt-2 text-xs ${isBusinessWorkspace ? "text-[var(--biz-muted)]" : "text-gray-500"}`}>
            <Link
              href="/terms"
              onClick={() => setIsOpen(false)}
              className={`transition-colors ${isBusinessWorkspace ? "hover:text-[var(--biz-text)]" : "hover:text-gray-300"}`}
            >
              Terms
            </Link>
            <span>·</span>
            <Link
              href="/privacy"
              onClick={() => setIsOpen(false)}
              className={`transition-colors ${isBusinessWorkspace ? "hover:text-[var(--biz-text)]" : "hover:text-gray-300"}`}
            >
              Privacy
            </Link>
          </div>
        </div>
      </div>

      <PricingModal isOpen={pricingOpen} onClose={() => setPricingOpen(false)} />
    </>
  );
}
