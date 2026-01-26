"use client";

import Sidebar from "./Sidebar";
import SportsCardBackground from "./SportsCardBackground";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#0f1419] relative overflow-hidden">
      {/* Global sports card background */}
      <SportsCardBackground variant="default" />

      <Sidebar />
      {/* Main content area with padding for sidebar */}
      <div className="flex-1 lg:ml-64 relative z-10">
        <div className="min-h-screen">{children}</div>
      </div>
    </div>
  );
}
