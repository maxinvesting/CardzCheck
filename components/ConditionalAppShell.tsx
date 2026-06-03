"use client";

import { usePathname } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";

/**
 * ConditionalAppShell — single, persistent app shell.
 *
 * Rendered once in the root layout (via AppProviders) so the sidebar, section
 * tabs, and background PERSIST across client navigations instead of remounting
 * on every page. Previously each page rendered its own <AuthenticatedLayout>,
 * which tore down and rebuilt the entire shell (and re-ran its data fetches)
 * on every click. Hoisting it here keeps the shell mounted; only `children`
 * swap on navigation.
 *
 * Routes that must render WITHOUT the shell (public/auth pages, full-bleed card
 * detail views, print views, messaging panes) are listed below and render their
 * children bare — preserving the prior per-page behavior exactly.
 */

// Exact paths that render bare (no shell).
const BARE_EXACT = new Set<string>([
  "/",
  "/login",
  "/signup",
  "/privacy",
  "/terms",
  "/test-auth",
  "/analyst-setup",
]);

// Path prefixes that render bare (no shell).
const BARE_PREFIXES = [
  "/grade-report",          // print / export views
  "/card/",                 // full-bleed card detail
  "/business/card/",        // re-export of /card detail
  "/cards/",                // legacy card detail
  "/marketplace/messages",  // buyer/seller messaging panes
];

function isBareRoute(pathname: string): boolean {
  if (BARE_EXACT.has(pathname)) return true;
  return BARE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

export function ConditionalAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";

  if (isBareRoute(pathname)) {
    return <>{children}</>;
  }

  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
