"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User as AuthUser, Session } from "@supabase/supabase-js";
import { isTestMode, getTestAuthUser } from "@/lib/test-mode";

interface AuthContextType {
  session: Session | null;
  authUser: AuthUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  authUser: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In test mode, set mock user immediately
    if (isTestMode()) {
      const testUser = getTestAuthUser();
      setAuthUser(testUser as AuthUser);
      setSession({
        user: testUser as AuthUser,
        access_token: "test-token",
        refresh_token: "test-refresh",
        expires_in: 3600,
        expires_at: Date.now() / 1000 + 3600,
        token_type: "bearer",
      } as Session);
      setLoading(false);
      console.log("🧪 TEST MODE: Using mock auth user");
      return;
    }

    const supabase = createClient();

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, authUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
