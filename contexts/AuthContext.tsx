"use client";

import { createContext, useContext } from "react";
import type { User as AuthUser, Session } from "@supabase/supabase-js";
import { getLocalAuthUser } from "@/lib/single-user";

interface AuthContextType {
  session: Session | null;
  authUser: AuthUser | null;
  loading: boolean;
}

/**
 * Personal build: there is no login. The single local user is resolved
 * synchronously, so `loading` is never true and consumers that wait on it
 * render immediately.
 */
const localUser = getLocalAuthUser() as unknown as AuthUser;

const localSession = {
  user: localUser,
  access_token: "local",
  refresh_token: "local",
  expires_in: 3600,
  expires_at: Number.MAX_SAFE_INTEGER,
  token_type: "bearer",
} as unknown as Session;

const AuthContext = createContext<AuthContextType>({
  session: localSession,
  authUser: localUser,
  loading: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider
      value={{ session: localSession, authUser: localUser, loading: false }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
