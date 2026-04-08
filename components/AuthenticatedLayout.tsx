"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import SportsCardBackground from "./SportsCardBackground";
import BottomTabBar from "./BottomTabBar";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isBusinessRoute = pathname?.startsWith("/business");
  const isBusinessShell = isBusinessRoute || pathname === "/dashboard" || pathname?.startsWith("/grade-hub") || pathname?.startsWith("/bulk");

  return (
    <div
      className={`relative flex min-h-screen overflow-hidden ${
        isBusinessShell
          ? "business-theme bg-[var(--biz-bg)] text-[var(--biz-text)]"
          : "bg-[#0f1419]"
      }`}
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
