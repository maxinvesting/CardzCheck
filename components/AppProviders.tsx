"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ChunkLoadRecovery />
      {children}
    </AuthProvider>
  );
}
