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
  const isGradeWorkspace =
    pathname === "/grade-hub" ||
    pathname === "/business/grade-hub" ||
    pathname?.startsWith("/grade-hub/") ||
    pathname?.startsWith("/business/grade-hub/");
  const isBusinessRoute = pathname?.startsWith("/business") ?? false;
  const isAdminRoute = pathname?.startsWith("/admin");
  const isBusinessShell = isBusinessRoute || isAdminRoute || pathname === "/dashboard";
  const [appearance, setAppearance] = useState<BusinessAppearance>(
    DEFAULT_BUSINESS_APPEARANCE
  );

  useEffect(() => {
    if (!isBusinessRoute || isGradeWorkspace || typeof window === "undefined") return;

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
  }, [isBusinessRoute, isGradeWorkspace]);

  const businessAppearanceStyle = useMemo(
    () =>
      isBusinessRoute && !isGradeWorkspace
        ? getBusinessAppearanceCssVariables(appearance)
        : undefined,
    [appearance, isBusinessRoute, isGradeWorkspace]
  );

  return (
    <div
      className={`relative flex min-h-screen overflow-hidden ${
        isGradeWorkspace
          ? "bg-[#060606] text-[var(--biz-text)]"
          : isBusinessShell
          ? isBusinessRoute
            ? "business-theme business-workspace-theme bg-[var(--biz-bg)] text-[var(--biz-text)]"
            : "business-theme bg-[var(--biz-bg)] text-[var(--biz-text)]"
          : "bg-[#0f1419]"
      }`}
      style={businessAppearanceStyle}
    >
      {!isBusinessShell && !isGradeWorkspace && (
        <SportsCardBackground variant="default" />
      )}

      {!isGradeWorkspace ? <Sidebar /> : null}
      {/* Main content area with padding for sidebar and bottom tab */}
      <div
        className={`relative z-10 flex-1 min-w-0 pb-20 lg:pb-0 ${
          isGradeWorkspace ? "" : "lg:ml-64"
        }`}
      >
        <div className="min-h-screen">{children}</div>
      </div>
      {!isGradeWorkspace ? <BottomTabBar /> : null}
    </div>
  );
}
