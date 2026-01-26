"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TestAuthPage() {
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      setSessionInfo({
        hasSession: !!session,
        hasUser: !!user,
        sessionError: sessionError?.message || null,
        userError: userError?.message || null,
        userId: user?.id || null,
        userEmail: user?.email || null,
        accessToken: session?.access_token ? "EXISTS" : null,
        refreshToken: session?.refresh_token ? "EXISTS" : null,
      });

      setLoading(false);
    }

    checkAuth();
  }, []);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Auth Debug Page</h1>

      <div className="bg-gray-800 p-6 rounded-lg mb-4">
        <h2 className="text-xl font-semibold mb-2">Session Info:</h2>
        <pre className="bg-gray-950 p-4 rounded overflow-auto">
          {JSON.stringify(sessionInfo, null, 2)}
        </pre>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-gray-400">
          If you're logged in, you should see hasSession: true and hasUser: true
        </p>
        <p className="text-sm text-gray-400">
          If you see false for both, your session isn't being saved
        </p>
      </div>

      <div className="mt-6 space-x-4">
        <a href="/login" className="text-blue-400 hover:text-blue-300">
          Go to Login
        </a>
        <a href="/collection" className="text-blue-400 hover:text-blue-300">
          Try Collection Page
        </a>
      </div>
    </div>
  );
}
