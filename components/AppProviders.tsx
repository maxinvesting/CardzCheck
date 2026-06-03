"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { ConditionalAppShell } from "@/components/ConditionalAppShell";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ChunkLoadRecovery />
      <ConditionalAppShell>{children}</ConditionalAppShell>
    </AuthProvider>
  );
}
