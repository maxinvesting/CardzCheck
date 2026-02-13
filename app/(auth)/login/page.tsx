"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import SportsCardBackground from "@/components/SportsCardBackground";

const LOGIN_TIMEOUT_MS = 8000;
const STUCK_SAFETY_MS = 14000;

function sanitizeRedirectPath(rawRedirect: string | null): string {
  if (!rawRedirect || !rawRedirect.startsWith("/")) return "/dashboard";
  if (rawRedirect.startsWith("//")) return "/dashboard";
  if (rawRedirect.startsWith("/login") || rawRedirect.startsWith("/signup")) {
    return "/dashboard";
  }
  return rawRedirect;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const stuckSafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParams = useSearchParams();
  const redirect = sanitizeRedirectPath(searchParams.get("redirect"));

  useEffect(() => {
    return () => {
      if (stuckSafetyRef.current) clearTimeout(stuckSafetyRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    stuckSafetyRef.current = window.setTimeout(() => {
      stuckSafetyRef.current = null;
      setLoading(false);
      setError("Request took too long. Please check your connection and try again.");
    }, STUCK_SAFETY_MS);

    try {
      const controller = new AbortController();
      const requestPromise = fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        window.setTimeout(() => {
          controller.abort();
          reject(new Error("Login timed out. Please try again."));
        }, LOGIN_TIMEOUT_MS);
      });

      const response = await Promise.race([requestPromise, timeoutPromise]);

      const payload = await response.json().catch(() => ({} as Record<string, unknown>));

      if (!response.ok) {
        const message =
          typeof payload.error === "string"
            ? payload.error
            : "Unable to sign in right now. Please try again.";
        setError(message);
        return;
      }

      if (stuckSafetyRef.current) {
        clearTimeout(stuckSafetyRef.current);
        stuckSafetyRef.current = null;
      }
      window.location.href = redirect;
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Login timed out. Please try again."
          : err instanceof Error
            ? err.message
            : "Unable to sign in right now. Please try again.";
      setError(message);
    } finally {
      if (stuckSafetyRef.current) {
        clearTimeout(stuckSafetyRef.current);
        stuckSafetyRef.current = null;
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1419] px-4 relative overflow-hidden">
      <SportsCardBackground variant="default" />
      <div className="max-w-md w-full space-y-8 relative z-10">
        <div className="text-center">
          <Link href="/" className="flex justify-center">
            <span className="text-3xl font-bold text-white tracking-tight">
              CardzCheck
            </span>
          </Link>
          <h2 className="mt-6 text-2xl font-semibold text-white">
            Sign in to your account
          </h2>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="space-y-3">
              <div className="bg-red-900/20 border border-red-800 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
              {(error.toLowerCase().includes("timeout") ||
                error.toLowerCase().includes("unreachable") ||
                error.toLowerCase().includes("network") ||
                error.toLowerCase().includes("dns") ||
                error.toLowerCase().includes("too long") ||
                error.toLowerCase().includes("connection")) && (
                <div className="bg-gray-800/80 border border-gray-700 text-gray-300 px-4 py-3 rounded-lg text-sm space-y-2">
                  <p className="font-medium text-white">What to do next:</p>
                  <ul className="list-disc list-inside space-y-1 text-gray-400">
                    <li>Hard refresh <code className="text-gray-300">/login</code> and retry once (you should now get a clear error instead of endless spinner).</li>
                    <li>Fix local network/DNS path to Supabase (VPN, proxy, firewall, or DNS).</li>
                    <li>Try from a different network (e.g. phone hotspot) to confirm.</li>
                    <li>On macOS, you can try flushing DNS: <code className="text-gray-300">sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder</code></li>
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-4 py-3 border border-gray-700 rounded-lg shadow-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-4 py-3 border border-gray-700 rounded-lg shadow-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white"
                placeholder="Your password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="text-center text-sm text-gray-400">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-blue-400 hover:text-blue-300">
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0f1419]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
