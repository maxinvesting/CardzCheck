"use client";

import Sidebar from "./Sidebar";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#0f1419]">
      <Sidebar />
      {/* Main content area with padding for sidebar */}
      <div className="flex-1 lg:ml-64">
        <div className="min-h-screen">{children}</div>
      </div>
    </div>
  );
}
