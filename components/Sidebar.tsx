"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@/types";
import PricingModal from "@/components/PricingModal";
import { clearCurrentUserCache, getCurrentUserCached } from "@/lib/current-user-client";
import { createClient } from "@/lib/supabase/client";

type NavItem = {
  name: string;
  href: string;
  icon: ReactNode;
  badge?: string;
  isPro?: boolean;
  exact?: boolean;
  children?: NavItem[];
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

// Personal vs. business mode has been retired (PR C2b). Every logged-in
// user — Free, Business, or Business Pro — uses the same /business/*
// surfaces; tier gates handle feature differences. PERSONAL_NAV_ITEMS
// previously held the personal-mode array and has been removed.

function SalesIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7.5A2.5 2.5 0 015.5 5h10A2.5 2.5 0 0118 7.5v1.086a2 2 0 00.586 1.414l1.828 1.828A1 1 0 0120.707 13H18v3.5A2.5 2.5 0 0115.5 19h-10A2.5 2.5 0 013 16.5v-9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 10h6m-6 3h4" />
    </svg>
  );
}

function BUSINESS_NAV_ITEMS(): NavItem[] {
  return [
    { name: "Dashboard", href: "/business", icon: <HomeIcon />, exact: true },
    {
      name: "Ledger",
      href: "/business/ledger",
      icon: <LedgerIcon />,
      children: [
        { name: "Inventory", href: "/business/ledger", icon: <LedgerIcon /> },
        { name: "Sales & Trades", href: "/business/sales", icon: <SalesIcon /> },
        { name: "Sales Agent", href: "/business/sales-agent", icon: <SalesIcon /> },
      ],
    },
    { name: "Analytics", href: "/business/financials", icon: <BadgeIcon /> },
    { name: "Marketplace", href: "/marketplace", icon: <ShopIcon /> },
    {
      name: "Business",
      href: "/business/consultant",
      icon: <AnalystIcon />,
      children: [
        { name: "Advisor", href: "/business/consultant", icon: <AnalystIcon /> },
        { name: "Help & FAQ", href: "/business/help", icon: <HelpIcon /> },
      ],
    },
  ];
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [remainingSearches, setRemainingSearches] = useState<number | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Single nav for all logged-in users post PR C2b. The legacy
  // `isBusinessWorkspace` flag is kept (always true now) because many
  // styling branches below still reference it — collapsing those is a
  // separate pass.
  const isAdminUser = user?.app_role === "admin" || user?.app_role === "owner";
  const isBusinessRoute = pathname.startsWith("/business");
  const isBusinessWorkspace = true;
  const hasPaidWorkspace = true;
  const baseNavItems = BUSINESS_NAV_ITEMS();
  const navItems: NavItem[] = isAdminUser
    ? [
        ...baseNavItems,
        { name: "Admin", href: "/admin", icon: <AdminIcon />, badge: "Admin" },
      ]
    : baseNavItems;
  const businessSurfaceClass = "bg-[var(--biz-near-black)] border-[color:var(--biz-border)]";

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [profileOpen]);

  const handleLogout = async () => {
    setProfileOpen(false);
    clearCurrentUserCache();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const userInitial = user?.email?.[0]?.toUpperCase() ?? "?";
  const settingsHref = isBusinessWorkspace ? "/business/settings" : "/settings";

  const matches = (href: string, exact = false): boolean => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isActive = (item: NavItem): boolean => {
    if (matches(item.href, item.exact)) return true;
    return Boolean(item.children?.some((child) => matches(child.href, child.exact)));
  };

  const renderNavLink = (item: NavItem) => {
    const isProFeature = Boolean(item.isPro && user && !user.is_paid);
    const active = isActive(item);
    return (
      <Link
        key={item.href + item.name}
        href={item.href}
        onClick={() => setIsOpen(false)}
        className={`flex items-center gap-3 px-3 py-2 text-[13px] rounded transition-all ${
          active
            ? item.href.includes("/marketplace")
              ? isBusinessWorkspace
                ? "text-[var(--biz-text-strong)]"
                : "bg-[color:var(--biz-surface-raised)] text-[color:var(--biz-text-strong)] border border-[color:var(--biz-border-strong)]"
              : isBusinessWorkspace
              ? "text-[var(--biz-text-strong)]"
              : "bg-[color:var(--biz-surface-raised)] text-[color:var(--biz-text-strong)] border border-[color:var(--biz-border-strong)]"
            : isBusinessWorkspace
              ? "text-[var(--biz-muted-strong)] hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)]"
              : "text-[color:var(--biz-muted)] hover:text-[color:var(--biz-text)] hover:bg-[color:var(--biz-hover)]"
        }`}
        style={
          active && isBusinessWorkspace
            ? {
                background: isBusinessRoute
                  ? "var(--biz-nav-active-bg)"
                  : "rgba(255,255,255,0.06)",
                borderLeft: "2px solid var(--biz-nav-active-border)",
                paddingLeft: "13px",
              }
            : {}
        }
      >
        <span className="shrink-0 opacity-90">{item.icon}</span>
        <span className="truncate font-medium tracking-tight">{item.name}</span>
        {item.name === "Business Consultant" && isBusinessWorkspace && (
          <svg
            className="w-3.5 h-3.5 ml-1 shrink-0 opacity-60"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2l2 7h7l-6 4.5 2.3 7L12 17l-5.3 3.5L9 13 3 8.5h7z" />
          </svg>
        )}
        {item.badge && !isProFeature && (
          item.badge === "dot" ? (
            <span
              className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--biz-text-strong)] opacity-50"
            />
          ) : (
            <span
              className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold"
              style={
                isBusinessWorkspace
                  ? {
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "var(--biz-muted-strong)",
                    }
                  : {
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "var(--biz-muted-strong, #a1a1a1)",
                    }
              }
            >
              {item.badge}
            </span>
          )
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
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`lg:hidden fixed top-4 left-4 z-50 rounded-lg border p-2 transition-colors ${
          isBusinessWorkspace
            ? `${businessSurfaceClass} text-[var(--biz-muted)] hover:text-[var(--biz-text)]`
            : "bg-[color:var(--biz-surface)] border-[color:var(--biz-border)] text-[color:var(--biz-muted)] hover:text-[color:var(--biz-text)]"
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
            ? "bg-[var(--biz-near-black)] border-[color:var(--biz-border)]"
            : "bg-[color:var(--biz-near-black)] border-[color:var(--biz-border)]"
        } ${
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${!isOpen ? "pointer-events-none lg:pointer-events-auto" : ""}`}
      >
        <Link
          href={isBusinessWorkspace ? "/business" : "/dashboard"}
          className={`flex cursor-pointer items-center justify-between gap-3 border-b px-4 py-4 transition-opacity hover:opacity-90 ${
            isBusinessWorkspace ? "border-[color:var(--biz-border)]" : "border-[color:var(--biz-border)]"
          }`}
          onClick={() => setIsOpen(false)}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Image
              src="/cardzcheck-logo-main.png"
              alt="CardzCheck"
              width={132}
              height={28}
              className="h-7 w-auto max-w-[9.5rem] shrink-0 object-contain object-left"
              priority
            />
            <span
              className={`truncate text-base font-semibold tracking-tight ${
                isBusinessWorkspace ? "text-[var(--biz-text-strong)]" : "text-[color:var(--biz-text-strong)]"
              }`}
            >
              CardzCheck
            </span>
          </div>
        </Link>

        {isBusinessWorkspace ? (
          <div className="border-b border-[color:var(--biz-border)] px-4 pt-3 pb-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--biz-muted)] font-mono-num">
              Workspace
            </p>
          </div>
        ) : null}

        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {navItems.map((item) => renderNavLink(item))}

          {user && (user.app_role === "admin" || user.app_role === "owner") && (
            <>
              <div className={`mt-3 pb-1 px-3 text-[9px] font-semibold uppercase tracking-[0.16em] font-mono-num ${
                isBusinessWorkspace ? "text-[var(--biz-muted)]" : "text-[color:var(--biz-faint)]"
              }`}>
                Admin
              </div>
              {[
                { name: "Marketplace", href: "/admin/marketplace", icon: <ShopIcon /> },
                { name: "News", href: "/admin/news", icon: <NewsIcon /> },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                    pathname === item.href || pathname.startsWith(`${item.href}/`)
                      ? isBusinessWorkspace
                        ? "border-l-2 border-l-orange-500 bg-orange-500/10 text-orange-300"
                        : "bg-orange-600 text-white"
                      : isBusinessWorkspace
                        ? "text-[var(--biz-muted-strong)] hover:bg-[var(--biz-hover)] hover:text-[var(--biz-text)]"
                        : "text-[color:var(--biz-muted)] hover:text-[color:var(--biz-text)] hover:bg-[color:var(--biz-hover)]"
                  }`}
                >
                  <span className="shrink-0 opacity-90">{item.icon}</span>
                  <span className="truncate text-[13px] font-medium tracking-tight">{item.name}</span>
                  <span className={`ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] rounded-sm ${
                    isBusinessWorkspace
                      ? "bg-orange-500/15 border border-orange-500/30 text-orange-300"
                      : "bg-orange-500/20 text-orange-400"
                  }`}>
                    Admin
                  </span>
                </Link>
              ))}
            </>
          )}
        </nav>

        {user && (
          <div
            className={`space-y-3 border-t p-3 border-[color:var(--biz-border)]`}
          >
            {!hasPaidWorkspace && remainingSearches !== null && (
              <div className={`rounded px-3 py-2 border border-[color:var(--biz-border)] bg-[color:var(--biz-surface-soft)]`}>
                <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--biz-muted)] font-mono-num">Free Plan</div>
                <div className={`text-[12px] font-medium text-[color:var(--biz-text)]`}>
                  {remainingSearches} / 3 searches remaining
                </div>
              </div>
            )}

            <div className="flex items-center gap-2" ref={profileRef}>
              <div className="relative flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setProfileOpen((v) => !v)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-[color:var(--biz-hover)]`}
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold border border-[color:var(--biz-primary-border)] bg-[color:var(--biz-primary-soft)] text-[color:var(--biz-primary)]`}
                  >
                    {userInitial}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block truncate text-[12px] font-medium text-[color:var(--biz-text-strong)]`}>
                      {user.email}
                    </span>
                    {hasPaidWorkspace && (
                      <span className={`block text-[9px] font-semibold uppercase tracking-[0.14em] text-[color:var(--biz-primary)]`}>
                        {isBusinessWorkspace ? "Workspace · Pro" : "Pro"}
                      </span>
                    )}
                  </span>
                </button>

                {profileOpen && (
                  <div
                    role="menu"
                    className={`absolute bottom-full left-0 right-0 mb-2 rounded-md border shadow-lg overflow-hidden z-50 border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)]`}
                  >
                    <Link
                      href="/account"
                      onClick={() => { setProfileOpen(false); setIsOpen(false); }}
                      className={`block px-3 py-2 text-[12px] transition-colors text-[color:var(--biz-text)] hover:bg-[color:var(--biz-hover)]`}
                    >
                      Account
                    </Link>
                    {!hasPaidWorkspace && (
                      <button
                        type="button"
                        onClick={() => { setProfileOpen(false); setIsOpen(false); setPricingOpen(true); }}
                        className={`block w-full text-left px-3 py-2 text-[12px] font-semibold transition-colors text-[color:var(--biz-primary)] hover:bg-[color:var(--biz-hover)]`}
                      >
                        Upgrade to Pro
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className={`block w-full text-left px-3 py-2 text-[12px] transition-colors text-[color:var(--biz-text)] hover:bg-[color:var(--biz-hover)]`}
                    >
                      Log out
                    </button>
                    <div
                      className={`flex items-center justify-center gap-2 border-t px-3 py-1.5 text-[10px] border-[color:var(--biz-border)] text-[color:var(--biz-muted)]`}
                    >
                      <Link
                        href="/terms"
                        onClick={() => { setProfileOpen(false); setIsOpen(false); }}
                        className={`transition-colors hover:text-[color:var(--biz-text)]`}
                      >
                        Terms
                      </Link>
                      <span>·</span>
                      <Link
                        href="/privacy"
                        onClick={() => { setProfileOpen(false); setIsOpen(false); }}
                        className={`transition-colors hover:text-[color:var(--biz-text)]`}
                      >
                        Privacy
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {!hasPaidWorkspace && (
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); setPricingOpen(true); }}
                  className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors cc-btn-primary`}
                >
                  Upgrade
                </button>
              )}

              <Link
                href={settingsHref}
                onClick={() => setIsOpen(false)}
                aria-label="Settings"
                title="Settings"
                className={`shrink-0 flex h-8 w-8 items-center justify-center rounded transition-colors ${
                  pathname === settingsHref || pathname.startsWith(`${settingsHref}/`)
                    ? "bg-[color:var(--biz-hover)] text-[color:var(--biz-text-strong)]"
                    : "text-[color:var(--biz-muted-strong)] hover:bg-[color:var(--biz-hover)] hover:text-[color:var(--biz-text)]"
                }`}
              >
                <SettingsIcon />
              </Link>
            </div>
          </div>
        )}
      </div>

      <PricingModal isOpen={pricingOpen} onClose={() => setPricingOpen(false)} />
    </>
  );
}
