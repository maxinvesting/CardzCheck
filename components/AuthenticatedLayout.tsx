"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import SportsCardBackground from "./SportsCardBackground";
import BottomTabBar from "./BottomTabBar";
import {
  BUSINESS_APPEARANCE_UPDATED_EVENT,
  DEFAULT_BUSINESS_APPEARANCE,
  getBusinessAppearanceCssVariables,
  isBusinessAppearance,
  normalizeBusinessAppearance,
} from "@/lib/business/appearance";
import type { BusinessAppearance } from "@/types";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isBusinessRoute = pathname?.startsWith("/business") ?? false;
  const isAdminRoute = pathname?.startsWith("/admin");
  const isBusinessShell = isBusinessRoute || isAdminRoute || pathname === "/dashboard";
  const [appearance, setAppearance] = useState<BusinessAppearance>(
    DEFAULT_BUSINESS_APPEARANCE
  );

  useEffect(() => {
    if (!isBusinessRoute || typeof window === "undefined") return;

    let isMounted = true;

    const syncAppearance = async () => {
      try {
        const response = await fetch("/api/business/appearance", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!isMounted || !isBusinessAppearance(data)) return;
        setAppearance(normalizeBusinessAppearance(data));
      } catch {
        // Keep defaults on background failures.
      }
    };

    const handleAppearanceUpdate = (event: Event) => {
      const detail = (
        event as CustomEvent<{ appearance?: Partial<BusinessAppearance> }>
      ).detail;
      if (!detail?.appearance) return;
      setAppearance(normalizeBusinessAppearance(detail.appearance));
    };

    void syncAppearance();
    window.addEventListener(
      BUSINESS_APPEARANCE_UPDATED_EVENT,
      handleAppearanceUpdate as EventListener
    );

    return () => {
      isMounted = false;
      window.removeEventListener(
        BUSINESS_APPEARANCE_UPDATED_EVENT,
        handleAppearanceUpdate as EventListener
      );
    };
  }, [isBusinessRoute]);

  const businessAppearanceStyle = useMemo(
    () =>
      isBusinessRoute ? getBusinessAppearanceCssVariables(appearance) : undefined,
    [appearance, isBusinessRoute]
  );

  return (
    <div
      className={`relative flex min-h-screen overflow-hidden ${
        isBusinessShell
          ? isBusinessRoute
            ? "business-theme business-workspace-theme bg-[var(--biz-bg)] text-[var(--biz-text)]"
            : "business-theme bg-[var(--biz-bg)] text-[var(--biz-text)]"
          : "bg-[#0f1419]"
      }`}
      style={businessAppearanceStyle}
    >
      {!isBusinessShell && (
        <SportsCardBackground variant="default" />
      )}

      <Sidebar />
      {/* Main content area with padding for sidebar and bottom tab */}
      <div className="flex-1 min-w-0 lg:ml-64 relative z-10 pb-20 lg:pb-0 overflow-x-auto">
        <div className="min-h-screen min-w-0">{children}</div>
      </div>
      <BottomTabBar />
    </div>
  );
}
